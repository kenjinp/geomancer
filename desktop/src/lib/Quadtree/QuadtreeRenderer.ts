import * as THREE from "three";
import { CubicQuadtree } from "./CubicQuadtree";

import CustomShaderMaterial from "three-custom-shader-material/vanilla";

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
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `\
    

    // Declare the instance attribute
        attribute vec3 instanceColor;
        attribute int faceIndex;

        // Varying to pass to fragment shader
        varying vec3 vLevelColor;


      uniform float uRadius;

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




      void main() {

      vLevelColor = instanceColor;

      if (faceIndex == 0) {
        vLevelColor = vec3(1.0, 0.0, 0.0);
      }

      if (faceIndex == 1) {
        vLevelColor = vec3(0.0, 1.0, 0.0);
      }

      if (faceIndex == 2) {
        vLevelColor = vec3(0.0, 0.0, 1.0);
      }

      if (faceIndex == 3) {
        vLevelColor = vec3(1.0, 1.0, 0.0);
      }

      if (faceIndex == 4) {
        vLevelColor = vec3(1.0, 1.0, 1.0);
      }

      if (faceIndex == 5) {
        vLevelColor = vec3(0.0, 1.0, 1.0);
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
    },
    // flatShading: true,
    // color,
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

    const maxInstanceCount = 2_048 * 6;

    const colors = new Float32Array(maxInstanceCount * 3); // RGB, so 3 values per instance
    colors.fill(0);

    const faceIndices = new Int16Array(maxInstanceCount);
    faceIndices.fill(-1);

    const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3); // 3 components per instance
    planeGeometry.setAttribute("instanceColor", colorAttribute);

    const faceAttribute = new THREE.InstancedBufferAttribute(faceIndices, 1); // 1 component per instance
    faceAttribute.setUsage(THREE.DynamicDrawUsage);
    faceAttribute.gpuType = THREE.IntType;
    planeGeometry.setAttribute("faceIndex", faceAttribute);

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

  update(selectedFaceIndex: number): void {
    // Update instances for each face
    const faces = this.quadtree.getFaces();
    const qt = this.quadtree;

    const tempMatrix4 = this.tempMatrix4;
    const tempMatrix4_2 = this.tempMatrix4_2;
    const tempMatrix4_3 = this.tempMatrix4_3;
    const tempVector = this.tempVector;
    const tempScale = this.tempScale;
    const mesh = this.mesh;

    tempMatrix4_2.identity();
    tempMatrix4_3.identity();

    let instanceCount = 0;

    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      const face = faces[faceIndex];
      const colors = mesh.geometry.getAttribute("instanceColor");
      const faceIndices = mesh.geometry.getAttribute("faceIndex");

      // Iterate through all nodes in the face's quadtree
      for (let nodeIndex = 0; nodeIndex < face.nodeBuffer.size; nodeIndex++) {
        // Get node properties
        const center = face.nodeBuffer.getCenter(nodeIndex, tempVector);
        const size = face.nodeBuffer.getSize(nodeIndex, tempScale);
        const level = face.getNodeLevel(nodeIndex);
        // Set matrix transformation
        tempMatrix4
          .identity()
          .multiply(face.localToWorld) // Apply face orientation
          .multiply(tempMatrix4_2.makeTranslation(center.x, center.y, center.z)) // Position
          .multiply(tempMatrix4_3.makeScale(size.x, size.y, 1)); // Scale (z=1 since we're using a plane)

        const absoluteNodeIndex = qt.getAbsoluteIndex(faceIndex, nodeIndex);

        const color = createColorFromLevel(level);
        colors.setXYZ(absoluteNodeIndex, color.r, color.g, color.b);
        faceIndices.setX(
          absoluteNodeIndex,
          selectedFaceIndex === faceIndex ? selectedFaceIndex : -1
        );
        // faceIndices.array[nodeIndex] =
        // selectedFaceIndex === faceIndex ? selectedFaceIndex : -1;
        colors.needsUpdate = true;
        faceIndices.needsUpdate = true;
        // Set the instance matrix
        mesh.setMatrixAt(absoluteNodeIndex, tempMatrix4);
        instanceCount++;
      }
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
