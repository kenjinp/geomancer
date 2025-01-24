import * as THREE from "three";
import { CubicQuadtree } from "./CubicQuadtree";

import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import { MAX_NODES_PER_TREE } from "./constants";

const tempColor = new THREE.Color();

let maxLevel = 0;
const createColorFromLevel = (level: number) => {
  maxLevel = Math.max(level, maxLevel);
  const levelConverted = THREE.MathUtils.mapLinear(level, 0, maxLevel, 0, 1);
  tempColor.setRGB(levelConverted, 0, 0);
  return tempColor;
};

const getMaterial = (color: number) =>
  new CustomShaderMaterial({
    baseMaterial: THREE.MeshStandardMaterial,
    side: THREE.FrontSide,
    vertexShader: /* glsl */ `\

    attribute int nodeBuffer;
    varying vec3 vLevelColor;
    uniform float uRadius;
    uniform int uSelectedNodeIndex;

    int getFaceFromNodeIndex(int nodeIndex) {
        const int nodesPerFace = 10000;
        return nodeIndex / nodesPerFace;
    }

      // Node data structure
      struct NodeData {
          ivec4 childIndices;  // 4 child indices
          int childCount;      // Number of children
          int flags;          // Node flags
          int parent;         // Parent index
          ivec4 neighbors;    // 4 neighbors (left, right, top, bottom)
      };

      // Function to decode node data from the instance buffer
      // NodeData decodeNodeData(int nodeIndex) {
      //     // Constants from your TypeScript code
      //     const int NODE_INT_COUNT = 11;
          
      //     // Calculate base offset for this node in the int buffer
      //     int baseOffset = nodeIndex * NODE_INT_COUNT;
          
      //     NodeData data;
          
      //     // Read child indices (first 4 ints)
      //     data.childIndices = ivec4(
      //         nodeBuffer[baseOffset + 0],
      //         nodeBuffer[baseOffset + 1],
      //         nodeBuffer[baseOffset + 2],
      //         nodeBuffer[baseOffset + 3]
      //     );
          
      //     // Read child count (5th int)
      //     data.childCount = nodeBuffer[baseOffset + 4];
          
      //     // Read flags (6th int)
      //     data.flags = nodeBuffer[baseOffset + 5];
          
      //     // Read parent index (7th int)
      //     data.parent = nodeBuffer[baseOffset + 6];
          
      //     // Read neighbors (last 4 ints)
      //     data.neighbors = ivec4(
      //         nodeBuffer[baseOffset + 7],
      //         nodeBuffer[baseOffset + 8],
      //         nodeBuffer[baseOffset + 9],
      //         nodeBuffer[baseOffset + 10]
      //     );
          
      //     return data;
      // }

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

      void main() {
        int instanceId = gl_InstanceID;
        int faceIndex =  getFaceFromNodeIndex(instanceId);

        vLevelColor = getRandomColor(instanceId);
        vec3 faceIndexColor = vec3(0.0, 0.0, 0.0);
        vec3 selectedNodeIndexColor = vec3(0.0, 0.0, 1.0);

        if (faceIndex == 0) {
          faceIndexColor = vec3(1.0, 0.0, 0.0);
        }

        if (faceIndex == 1) {
          faceIndexColor = vec3(0.0, 1.0, 0.0);
        }

        if (faceIndex == 2) {
          faceIndexColor = vec3(0.0, 0.0, 1.0);
        }

        if (faceIndex == 3) {
          faceIndexColor = vec3(1.0, 1.0, 0.0);
        }

        if (faceIndex == 4) {
          faceIndexColor = vec3(1.0, 1.0, 1.0);
        }

        if (faceIndex == 5) {
          faceIndexColor = vec3(0.0, 1.0, 1.0);
        }

        vLevelColor = mix(vLevelColor, faceIndexColor, 0.8);

        if (uSelectedNodeIndex == instanceId) {
          vLevelColor = mix(vLevelColor, selectedNodeIndexColor, 0.8);
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

        // csm_Normal = recalcNormals(csm_Position);
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
      uTime: {
        value: 0,
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

  constructor(private quadtree: CubicQuadtree) {
    // Create base plane geometry that will be instanced
    const segmentsPerChunk = 8;
    const planeGeometry = new THREE.PlaneGeometry(
      1,
      1,
      segmentsPerChunk,
      segmentsPerChunk
    );

    // Create materials for each face with different colors
    const material = getMaterial(0x000000);

    const maxInstanceCount = MAX_NODES_PER_TREE * 6;

    const nodeBufferAttribute = new THREE.InstancedBufferAttribute(
      this.quadtree.unifiedBuffer.intBuffer,
      1
    ); // 1 component per instance
    nodeBufferAttribute.setUsage(THREE.DynamicDrawUsage);
    nodeBufferAttribute.gpuType = THREE.IntType;
    planeGeometry.setAttribute("nodeBuffer", nodeBufferAttribute);

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
    const nodeBuffer = mesh.geometry.getAttribute("nodeBuffer");

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

        // Set the instance matrix
        mesh.setMatrixAt(instanceCount, tempMatrix4);
        instanceCount++;
      });
    }
    // Update instance count
    mesh.count = instanceCount;
    mesh.instanceMatrix.needsUpdate = true;
    nodeBuffer.needsUpdate = true;
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
