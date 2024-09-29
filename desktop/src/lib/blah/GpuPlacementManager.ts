using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

[ExecuteAlways]
public class ProcedulraGPUPlacementManager : MonoBehaviour
{
    public int GridSize = 64;
    public GameObject Prefab;
    public float ScatteringRadius = 1.0f;
    public float RadiusScale = 1.0f;
    public bool DrawPattern;
    public bool TilePattern;
    public bool DrawGrid;
    public bool Render;
    public bool Regenerate;
    public bool LiveUpdate;

    public Terrain Terrain;
    public ComputeShader PointCloudShader;
    public RenderTexture DiscreteMap;
    // public Texture2D DensityMap;

    public int Seed = 42;
    public List<Vector2> OrderedPointsPattern;

    private ComputeBuffer orderedPointCouldBuffer;
    private ComputeBuffer indirectShaderDataBuffer;
    private ComputeBuffer positionsBuffer;
    private ComputeBuffer argsBuffer;

    [System.Serializable]
    public struct PrefabData
    {
        public Mesh PrefabMesh;
        public Material PrefabMaterial;
        public int SubMeshIndex;
    }

    [System.Serializable]
    public struct IndirectArguments
    {
        public uint IndexCount;
        public uint IndexStart;
        public uint BaseVertex;
    }

    public List<PrefabData> prefabData;
    public List<IndirectArguments> prefabIndirectArgs;

    [ContextMenu("Generate Discretizing Pattern")]
    private void GenerateOrderedPointsPattern()
    {
        Random.InitState(Seed);
        OrderedPointsPattern = PoissonDiskSampler.GeneratePoints(1.0f, new Vector2(32.0f, 32.0f));
    }

    private void ClearDiscreteMap()
    {
        var kernelID = PointCloudShader.FindKernel("ClearDiscreteMap");

        PointCloudShader.SetTexture(kernelID, "DiscretizedPlacementMap", DiscreteMap);
        PointCloudShader.Dispatch(kernelID, (DiscreteMap.width / 8) + 1, (DiscreteMap.height / 8) + 1, 1);
    }

    private void GeneratePointClound()
    {
        if (orderedPointCouldBuffer != null) orderedPointCouldBuffer.Release();
        orderedPointCouldBuffer = new ComputeBuffer(OrderedPointsPattern.Count, 8);
        orderedPointCouldBuffer.SetData(OrderedPointsPattern);

        var kernelID = PointCloudShader.FindKernel("Discretize");
        var splatMap = Terrain.terrainData.alphamapTextures[0];

        if (indirectShaderDataBuffer != null) indirectShaderDataBuffer.Release();
        if (positionsBuffer != null) positionsBuffer.Release();
        if (argsBuffer != null) argsBuffer.Release();

        indirectShaderDataBuffer = new ComputeBuffer(1024 * 1024, 16 * 4 * 2 + 16, ComputeBufferType.Append);
        indirectShaderDataBuffer.SetCounterValue(0);
        positionsBuffer = new ComputeBuffer(1024 * 1024, 16, ComputeBufferType.Append);
        positionsBuffer.SetCounterValue(0);
        argsBuffer = new ComputeBuffer(prefabIndirectArgs.Count, 5 * sizeof(uint), ComputeBufferType.IndirectArguments);

        var offsets = new List<Vector4>();
        // (0, 0), (0, 1), (1, 0), (1, 1)
        var tilePerSide = 2;
        for (var x = 0; x < tilePerSide; x++)
        {
            for (var z = 0; z < tilePerSide; z++)
            {
                offsets.Add(new Vector4(x * (Terrain.terrainData.size.x / (float)tilePerSide), z * (Terrain.terrainData.size.z / (float)tilePerSide), 0, 0));
            }
        }

        PointCloudShader.SetInt("OffsetsCount", offsets.Count);
        PointCloudShader.SetVectorArray("OffsetList", offsets.ToArray());
        PointCloudShader.SetBuffer(kernelID, "OrderedPointCloudBuffer", orderedPointCouldBuffer);
        PointCloudShader.SetInt("OrderedPointCloudCount", OrderedPointsPattern.Count);
        PointCloudShader.SetFloat("FootprintRadius", RadiusScale);

        PointCloudShader.SetTexture(kernelID, "PlacementMap", splatMap);
        PointCloudShader.SetFloat("TerrainSize", Terrain.terrainData.size.x);
        PointCloudShader.SetBuffer(kernelID, "IndirectShaderDataBuffer", indirectShaderDataBuffer);
        PointCloudShader.Dispatch(kernelID, (splatMap.width / 8) + 1, (splatMap.height / 8) + 1, 1);

        var argsData = new uint[prefabIndirectArgs.Count * 5];
        for (int i = 0; i < prefabIndirectArgs.Count; i++)
        {
            argsData[i * 5 + 0] = prefabIndirectArgs[i].IndexCount;
            argsData[i * 5 + 1] = 0;
            argsData[i * 5 + 2] = prefabIndirectArgs[i].IndexStart;
            argsData[i * 5 + 3] = prefabIndirectArgs[i].BaseVertex;
            argsData[i * 5 + 4] = 0;
        }

        argsBuffer.SetData(argsData);

        for (int i = 0; i < prefabIndirectArgs.Count; i++)
        {
            ComputeBuffer.CopyCount(indirectShaderDataBuffer, argsBuffer, i * 5 * 4 + 4);
        }

        argsBuffer.GetData(argsData);
        Debug.Log(argsData[1]);
    }

    private void GenerateInstances()
    {
        ClearDiscreteMap();
        GeneratePointClound();

        // PointCloudShader.Dispatch(kernelID, (DiscreteMap.width / 8) + 1, (DiscreteMap.height / 8) + 1, 1);
    }

    private void OnEnable()
    {
#if UNITY_EDITOR
        SceneView.duringSceneGui -= this.SceneGUI;
        SceneView.duringSceneGui += this.SceneGUI;
#endif
    }

    private void OnDisable()
    {
#if UNITY_EDITOR
        SceneView.duringSceneGui -= this.SceneGUI;
#endif
    }

    private void Update()
    {
        if (!Render) return;

        if (Regenerate)
        {
            InitializePrefabDataAndIndirectArgs();
            GenerateInstances();
            Regenerate = false;
        }

        for (int i = 0; i < prefabIndirectArgs.Count; i++)
        {
            var data = prefabData[i];
            var args = prefabIndirectArgs[i];

            data.PrefabMaterial.SetBuffer("IndirectShaderDataBuffer", indirectShaderDataBuffer);
            data.PrefabMaterial.SetBuffer("VisibleShaderDataBuffer", indirectShaderDataBuffer);
            Graphics.DrawMeshInstancedIndirect(data.PrefabMesh, data.SubMeshIndex, data.PrefabMaterial, new Bounds(Vector3.one * 50.0f, Vector3.one * 100.0f), argsBuffer, i * 5 * 4);
        }
    }

    private void InitializePrefabDataAndIndirectArgs()
    {
        if (prefabData != null && prefabData.Count > 0 && prefabIndirectArgs != null && prefabIndirectArgs.Count > 0 && prefabData.Count == prefabIndirectArgs.Count) return;

        prefabData = new List<PrefabData>();
        prefabIndirectArgs = new List<IndirectArguments>();
        var lodGroup = Prefab.GetComponent<LODGroup>();
        if (lodGroup)
        {
            var lod0 = Prefab.transform.GetChild(0).gameObject;
            var meshFilter = lod0.GetComponent<MeshFilter>();
            var meshRenderer = lod0.GetComponent<MeshRenderer>();
            for (int i = 0; i < meshRenderer.sharedMaterials.Length; i++)
            {
                var mesh = meshFilter.sharedMesh;

                prefabData.Add(new PrefabData
                {
                    PrefabMaterial = meshRenderer.sharedMaterials[i],
                    PrefabMesh = mesh,
                    SubMeshIndex = i
                });

                prefabIndirectArgs.Add(new IndirectArguments
                {
                    IndexCount = mesh.GetIndexCount(i),
                    IndexStart = mesh.GetIndexStart(i),
                    BaseVertex = mesh.GetBaseVertex(i),
                });

            }
        }
    }

    private void OnDrawGizmos()
    {
        var gizmosColor = Gizmos.color;

        if (DrawGrid)
        {
            Gizmos.color = Color.yellow;

            var terrainSize = Terrain.terrainData.size.x;
            var cellSize = terrainSize / GridSize;

            for (int x = 0; x < GridSize; x++)
            {
                for (int z = 0; z < GridSize; z++)
                {
                    var position = new Vector3(x * cellSize + cellSize * 0.5f, 0.0f, z * cellSize + cellSize * 0.5f);
                    Gizmos.DrawWireCube(position, Vector3.one * cellSize);
                }
            }

        }


        Gizmos.color = gizmosColor;
    }

#if UNITY_EDITOR
    private void SceneGUI(SceneView sceneView)
    {
        if (DrawPattern)
        {
            if (OrderedPointsPattern != null)
            {
                var tilePerSide = 2;
                for (var x = 0; x < tilePerSide; x++)
                {
                    for (var z = 0; z < tilePerSide; z++)
                    {
                        var offset = new Vector3(x * (Terrain.terrainData.size.x / (float)tilePerSide), 0.0f, z * (Terrain.terrainData.size.z / (float)tilePerSide));
                        if (x == 0 && z == 0)
                            Handles.color = Color.yellow;
                        else
                            Handles.color = Color.red;

                        foreach (var point in OrderedPointsPattern)
                        {
                            Handles.DrawWireDisc(new Vector3(point.x, 0.0f, point.y) * RadiusScale + offset, Vector3.up, 0.5f);
                        }
                    }
                }
            }
        }
    }
#endif
}
