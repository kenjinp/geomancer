import * as THREE from "three";
import { CubicQuadtree } from "./CubicQuadtree";

import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import { MAX_NODES_PER_TREE, NODE_INT_COUNT } from "./constants";

const tempColor = new THREE.Color();

let maxLevel = 0;
const createColorFromLevel = (level: number) => {
  maxLevel = Math.max(level, maxLevel);
  const levelConverted = THREE.MathUtils.mapLinear(level, 0, maxLevel, 0, 1);
  tempColor.setRGB(levelConverted, 0, 0);
  return tempColor;
};

const getMaterial = () =>
  new CustomShaderMaterial({
    baseMaterial: THREE.MeshStandardMaterial,
    side: THREE.FrontSide,
    vertexShader: /* glsl */ `\
    varying vec3 vLevelColor;
    uniform float uRadius;
    uniform int uSelectedNodeIndex;
    uniform ivec4 uSelectedNodeChildIndices;
    uniform ivec4 uSelectedNodeNeighbors;

      // Bend vertices of an instanced mesh into a spherical shape
      vec3 bendInstancedToSphere(vec3 position, mat4 instanceMatrix, vec3 sphereCenter, float radius) {
          // First transform the vertex to world space using instance and model matrices
          mat4 worldMatrix = modelMatrix * instanceMatrix;
          vec3 worldPos = (worldMatrix * vec4(position, 1.0)).xyz;
          
          // Calculate vector from sphere center to world position
          vec3 toPoint = worldPos - sphereCenter;
          float dist = length(toPoint);
          
          // If point is at center, return original to avoid division by zero
          if (dist < 0.0001) {
              return position;
          }
          
          // Normalize the direction vector
          vec3 direction = toPoint / dist;
          
          // Calculate how much the point should be bent
          float bendDist = min(dist, radius);
          
          // Calculate the final world position
          vec3 bentWorldPos = sphereCenter + direction * bendDist;
          
          // Transform back to object space
          vec3 bentPos = (inverse(worldMatrix) * vec4(bentWorldPos, 1.0)).xyz;
          
          return bentPos;
      }

      float hash(float n) {
          return fract(sin(n) * 43758.5453123);
      }

      vec3 getRandomColor(int id) {
          float f = float(id);
          return vec3(
              hash(f),
              hash(f + 1.0),
              hash(f + 2.0)
          );
      }

      vec3 orthogonal(vec3 v) {
        return normalize(abs(v.x) > abs(v.z) ? vec3(-v.y, v.x, 0.0)
        : vec3(0.0, -v.z, v.y));
      }

      vec3 recalcNormals(vec3 newPos) {
        float offset = 0.001;
        vec3 tangent = orthogonal(normal);
        vec3 bitangent = normalize(cross(normal, tangent));
        vec3 neighbour1 = position + tangent * offset;
        vec3 neighbour2 = position + bitangent * offset;

        vec3 displacedNeighbour1 = bendInstancedToSphere(neighbour1, instanceMatrix, vec3(0.0), uRadius);
        vec3 displacedNeighbour2 =  bendInstancedToSphere(neighbour2, instanceMatrix, vec3(0.0), uRadius);

        vec3 displacedTangent = displacedNeighbour1 - newPos;
        vec3 displacedBitangent = displacedNeighbour2 - newPos;

        return normalize(cross(displacedTangent, displacedBitangent));
      }

      void main() {
        int instanceId = gl_InstanceID;

        vLevelColor = getRandomColor(instanceId);
        vLevelColor = mix(vLevelColor, vec3(1.0, 1.0, 1.0), 0.3);
        // vec3 faceIndexColor = vec3(0.0, 0.0, 0.0);
        vec3 selectedNodeIndexColor = vec3(0.0, 0.0, 1.0);
        vec3 selectedNodeNeighborsColor = vec3(1.0, 0.0, 0.0);
        vec3 selectedNodeChildIndicesColor = vec3(0.0, 1.0, 0.0);



        // vLevelColor = mix(vLevelColor, faceIndexColor, 0.8);

        if (uSelectedNodeIndex == instanceId) {
          vLevelColor = mix(vLevelColor, selectedNodeIndexColor, 0.8);
        }

        for (int i = 0; i < 4; i++) {
          if (uSelectedNodeChildIndices[i] == instanceId) {
            vLevelColor = selectedNodeChildIndicesColor;
          }
        }

        for (int i = 0; i < 4; i++) {
          if (uSelectedNodeNeighbors[i] == instanceId) {
            vLevelColor = selectedNodeNeighborsColor;
          }
        }

        // Apply the spherical bend
        vec3 bentPosition = bendInstancedToSphere(
              position,
              instanceMatrix,
              vec3(0.0),
              uRadius
        );
        csm_Position = bentPosition;
        // csm_Position = position;

        // Recalculate normals for spherical bending by normalizing position vector
        // This makes normals point outward from sphere center
        // csm_Normal = normalize(bentPosition - vec3(0.0));
        csm_Normal = recalcNormals(bentPosition);
      }
    
  `,
    fragmentShader: /* glsl */ `

     // Receive the varying from vertex shader
        varying vec3 vLevelColor;

        void main() {
            csm_DiffuseColor = vec4(vLevelColor, 1.0);
        }
    `,
    uniforms: {
      uSelectedNodeChildIndices: {
        value: new Int32Array(4).fill(-1),
      },
      uSelectedNodeNeighbors: {
        value: new Int32Array(4).fill(-1),
      },
      uRadius: {
        value: 1.0,
      },
      uSelectedNodeIndex: {
        value: -1,
      },
    },
  });

export class QuadtreeRenderer {
  private mesh: THREE.InstancedMesh;
  private readonly tempMatrix4 = new THREE.Matrix4();
  private readonly tempMatrix4_2 = new THREE.Matrix4();
  private readonly tempMatrix4_3 = new THREE.Matrix4();
  private readonly tempVector = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private nodeBufferTexture: THREE.DataTexture;

  constructor(private quadtree: CubicQuadtree) {
    // Create base plane geometry that will be instanced
    const segmentsPerChunk = 8;
    const planeGeometry = new THREE.PlaneGeometry(
      1,
      1,
      segmentsPerChunk,
      segmentsPerChunk
    );

    const maxInstanceCount = MAX_NODES_PER_TREE * 6;

    const material = getMaterial();
    // Initialize instance matrices for each face
    material.uniforms["uRadius"].value = 2048.0;

    // Start with a reasonable maximum instance count
    this.mesh = new THREE.InstancedMesh(
      planeGeometry,
      material,
      maxInstanceCount
    );

    // this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.mesh.count = 0; // Will be updated when updating instances
  }

  update(selectedNodeIndex: number): void {
    // Update instances for each face
    const faces = this.quadtree.getFaces();

    const tempMatrix4 = this.tempMatrix4;
    const tempMatrix4_2 = this.tempMatrix4_2;
    const tempMatrix4_3 = this.tempMatrix4_3;
    const tempVector = this.tempVector;
    const tempScale = this.tempScale;
    const mesh = this.mesh;

    (mesh.material as THREE.Material).uniforms["uSelectedNodeIndex"].value =
      selectedNodeIndex;

    tempMatrix4_2.identity();
    tempMatrix4_3.identity();

    let instanceCount = 0;
    const nodeBuffer = this.quadtree.getCompactedIntBuffer();
    const selectedNodeChildIndices = nodeBuffer.slice(
      selectedNodeIndex * NODE_INT_COUNT,
      selectedNodeIndex * NODE_INT_COUNT + 4
    );
    const selectedNodeNeighbors = nodeBuffer.slice(
      selectedNodeIndex * NODE_INT_COUNT + 8,
      selectedNodeIndex * NODE_INT_COUNT + 12
    );

    mesh.material.uniforms["uSelectedNodeChildIndices"].value =
      selectedNodeChildIndices;
    mesh.material.uniforms["uSelectedNodeNeighbors"].value =
      selectedNodeNeighbors;

    mesh.material.needsUpdate = true;

    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      const face = faces[faceIndex];
      // Iterate through all nodes in the face's quadtree
      face.nodeBuffer.iterate((nodeIndex) => {
        // Get node properties
        const center = face.nodeBuffer.getCenter(nodeIndex, tempVector);
        const size = face.nodeBuffer.getSize(nodeIndex, tempScale);

        // assign faceId in the buffer;
        face.nodeBuffer.setFace(nodeIndex, faceIndex);
        // const level = face.getNodeLevel(nodeIndex);
        // Set matrix transformation
        tempMatrix4
          .identity()
          .multiply(face.localToWorld) // Apply face orientation
          .multiply(tempMatrix4_2.makeTranslation(center.x, center.y, center.z)) // Position
          .multiply(tempMatrix4_3.makeScale(size.x, size.y, 1)); // Scale (z=1 since we're using a plane)

        // nodeBuffer.setComponent(
        //   instanceCount,
        //   1,
        //   face.nodeBuffer.getFace(nodeIndex)
        // );
        // Set the instance matrix
        mesh.setMatrixAt(instanceCount, tempMatrix4);
        instanceCount++;
      });
    }

    // Update instance count
    mesh.count = instanceCount;
    mesh.instanceMatrix.needsUpdate = true;
  }

  getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  // Helper method to add meshes to a scene
  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }

  // Helper method to remove meshes from a scene
  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }

  // Optional: Set wireframe mode
  setWireframe(enabled: boolean): void {
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.wireframe = enabled;
  }

  // Optional: Set face colors
  setFaceColor(faceIndex: number, color: THREE.Color | number): void {
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.color = new THREE.Color(color);
  }

  // Optional: Set opacity for visualization
  setOpacity(opacity: number): void {
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.transparent = opacity < 1;
    material.opacity = opacity;
  }

  dispose(): void {
    // Clean up geometries and materials
    const geometry = this.mesh.geometry;
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.dispose();
    geometry.dispose();
  }
}
