import { Vector2, Vector3, Vector4, Color, Mesh, Material, Bounds, LODGroup, MeshFilter, MeshRenderer } from 'three';

interface PrefabData {
  prefabMesh: Mesh;
  prefabMaterial: Material; 
  subMeshIndex: number;
}

interface IndirectArguments {
  indexCount: number;
  indexStart: number;
  baseVertex: number;
}

export class ProceduralGPUPlacementManager {
  gridSize = 64;
  prefab: any;
  scatteringRadius = 1.0;
  radiusScale = 1.0;
  drawPattern = false;
  tilePattern = false;
  drawGrid = false;
  render = false;
  regenerate = false;
  liveUpdate = false;

  terrain: any;
  pointCloudShader: any;
  discreteMap: any;

  seed = 42;
  orderedPointsPattern: Vector2[] = [];

  private orderedPointCloudBuffer: any;
  private indirectShaderDataBuffer: any;
  private positionsBuffer: any;
  private argsBuffer: any;

  prefabData: PrefabData[] = [];
  prefabIndirectArgs: IndirectArguments[] = [];

  generateOrderedPointsPattern() {
    // Set random seed
    Math.seedrandom(this.seed.toString());
    this.orderedPointsPattern = this.generatePoissonPoints(1.0, new Vector2(32.0, 32.0));
  }

  private clearDiscreteMap() {
    const kernelID = this.pointCloudShader.findKernel("ClearDiscreteMap");

    this.pointCloudShader.setTexture(kernelID, "DiscretizedPlacementMap", this.discreteMap);
    this.pointCloudShader.dispatch(
      Math.floor(this.discreteMap.width / 8) + 1,
      Math.floor(this.discreteMap.height / 8) + 1,
      1
    );
  }

  private generatePointCloud() {
    if (this.orderedPointCloudBuffer) this.orderedPointCloudBuffer.dispose();
    this.orderedPointCloudBuffer = new GPUBuffer({
      size: this.orderedPointsPattern.length * 8,
      usage: GPUBufferUsage.STORAGE
    });
    this.orderedPointCloudBuffer.setSubData(0, this.orderedPointsPattern);

    const kernelID = this.pointCloudShader.findKernel("Discretize");
    const splatMap = this.terrain.terrainData.alphamapTextures[0];

    if (this.indirectShaderDataBuffer) this.indirectShaderDataBuffer.dispose();
    if (this.positionsBuffer) this.positionsBuffer.dispose();
    if (this.argsBuffer) this.argsBuffer.dispose();

    this.indirectShaderDataBuffer = new GPUBuffer({
      size: 1024 * 1024 * (16 * 4 * 2 + 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT
    });

    this.positionsBuffer = new GPUBuffer({
      size: 1024 * 1024 * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT  
    });

    this.argsBuffer = new GPUBuffer({
      size: this.prefabIndirectArgs.length * 5 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT
    });

    const offsets: Vector4[] = [];
    const tilePerSide = 2;
    for (let x = 0; x < tilePerSide; x++) {
      for (let z = 0; z < tilePerSide; z++) {
        offsets.push(new Vector4(
          x * (this.terrain.terrainData.size.x / tilePerSide),
          z * (this.terrain.terrainData.size.z / tilePerSide),
          0,
          0
        ));
      }
    }

    // Set compute shader parameters
    this.pointCloudShader.setInt("OffsetsCount", offsets.length);
    this.pointCloudShader.setVectorArray("OffsetList", offsets);
    this.pointCloudShader.setBuffer("OrderedPointCloudBuffer", this.orderedPointCloudBuffer);
    this.pointCloudShader.setInt("OrderedPointCloudCount", this.orderedPointsPattern.length);
    this.pointCloudShader.setFloat("FootprintRadius", this.radiusScale);
    this.pointCloudShader.setTexture("PlacementMap", splatMap);
    this.pointCloudShader.setFloat("TerrainSize", this.terrain.terrainData.size.x);
    this.pointCloudShader.setBuffer("IndirectShaderDataBuffer", this.indirectShaderDataBuffer);

    // Dispatch compute shader
    this.pointCloudShader.dispatch(
      Math.floor(splatMap.width / 8) + 1,
      Math.floor(splatMap.height / 8) + 1,
      1
    );

    // Set indirect args data
    const argsData = new Uint32Array(this.prefabIndirectArgs.length * 5);
    this.prefabIndirectArgs.forEach((args, i) => {
      argsData[i * 5 + 0] = args.indexCount;
      argsData[i * 5 + 1] = 0;
      argsData[i * 5 + 2] = args.indexStart;
      argsData[i * 5 + 3] = args.baseVertex;
      argsData[i * 5 + 4] = 0;
    });

    this.argsBuffer.setSubData(0, argsData);
  }

  generateInstances() {
    this.clearDiscreteMap();
    this.generatePointCloud();
  }

  update() {
    if (!this.render) return;

    if (this.regenerate) {
      this.initializePrefabDataAndIndirectArgs();
      this.generateInstances();
      this.regenerate = false;
    }

    this.prefabIndirectArgs.forEach((args, i) => {
      const data = this.prefabData[i];
      data.prefabMaterial.setBuffer("IndirectShaderDataBuffer", this.indirectShaderDataBuffer);
      data.prefabMaterial.setBuffer("VisibleShaderDataBuffer", this.indirectShaderDataBuffer);
      
      // Draw instanced mesh
      this.renderer.drawMeshInstancedIndirect(
        data.prefabMesh,
        data.subMeshIndex,
        data.prefabMaterial,
        new Bounds(new Vector3(50, 50, 50), new Vector3(100, 100, 100)),
        this.argsBuffer,
        i * 5 * 4
      );
    });
  }

  private initializePrefabDataAndIndirectArgs() {
    if (this.prefabData?.length > 0 && 
        this.prefabIndirectArgs?.length > 0 && 
        this.prefabData.length === this.prefabIndirectArgs.length) {
      return;
    }

    this.prefabData = [];
    this.prefabIndirectArgs = [];

    const lodGroup = this.prefab.getComponent(LODGroup);
    if (lodGroup) {
      const lod0 = this.prefab.children[0];
      const meshFilter = lod0.getComponent(MeshFilter);
      const meshRenderer = lod0.getComponent(MeshRenderer);

      meshRenderer.materials.forEach((material, i) => {
        const mesh = meshFilter.mesh;

        this.prefabData.push({
          prefabMaterial: material,
          prefabMesh: mesh,
          subMeshIndex: i
        });

        this.prefabIndirectArgs.push({
          indexCount: mesh.getIndexCount(i),
          indexStart: mesh.getIndexStart(i),
          baseVertex: mesh.getBaseVertex(i)
        });
      });
    }
  }

  drawGizmos() {
    if (this.drawGrid) {
      const terrainSize = this.terrain.terrainData.size.x;
      const cellSize = terrainSize / this.gridSize;

      for (let x = 0; x < this.gridSize; x++) {
        for (let z = 0; z < this.gridSize; z++) {
          const position = new Vector3(
            x * cellSize + cellSize * 0.5,
            0.0,
            z * cellSize + cellSize * 0.5
          );
          this.gizmos.drawWireCube(position, new Vector3(cellSize, cellSize, cellSize));
        }
      }
    }
  }

  drawSceneGUI() {
    if (this.drawPattern && this.orderedPointsPattern) {
      const tilePerSide = 2;
      for (let x = 0; x < tilePerSide; x++) {
        for (let z = 0; z < tilePerSide; z++) {
          const offset = new Vector3(
            x * (this.terrain.terrainData.size.x / tilePerSide),
            0.0,
            z * (this.terrain.terrainData.size.z / tilePerSide)
          );

          this.orderedPointsPattern.forEach(point => {
            const color = x === 0 && z === 0 ? new Color(1, 1, 0) : new Color(1, 0, 0);
            const position = new Vector3(point.x, 0, point.y).multiplyScalar(this.radiusScale).add(offset);
            this.handles.drawWireDisc(position, new Vector3(0, 1, 0), 0.5);
          });
        }
      }
    }
  }
}
