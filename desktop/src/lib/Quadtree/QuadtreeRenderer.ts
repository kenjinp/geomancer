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
    baseMaterial: THREE.MeshPhysicalMaterial,
    side: THREE.FrontSide,
    vertexShader: /* glsl */ `\


    // Declare the instance attribute
        attribute vec3 instanceColor;

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
  private meshes: THREE.InstancedMesh[];
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
    const materials = [
      getMaterial(0xff0000),
      // Right
      getMaterial(0x00ff00),
      // Left
      getMaterial(0x0000ff), // Top
      getMaterial(0xff00ff), // Bottom
      getMaterial(0xffff00), // Front
      getMaterial(0x00ffff), // Back
    ];

    const maxInstanceCount = 2_048;

    const colors = new Float32Array(maxInstanceCount * 3); // RGB, so 3 values per instance
    colors.fill(0);

    const colorAttribute = new THREE.InstancedBufferAttribute(colors, 3); // 3 components per instance
    planeGeometry.setAttribute("instanceColor", colorAttribute);

    // Initialize instance matrices for each face
    this.meshes = materials.map((material) => {
      material.uniforms["uRadius"].value = 2048.0;

      // Start with a reasonable maximum instance count
      const mesh = new THREE.InstancedMesh(
        planeGeometry,
        material,
        maxInstanceCount
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      mesh.count = 0; // Will be updated when updating instances
      return mesh;
    });
  }

  update(): void {
    // Update instances for each face
    const faces = this.quadtree.getFaces();

    const tempMatrix4 = this.tempMatrix4;
    const tempMatrix4_2 = this.tempMatrix4_2;
    const tempMatrix4_3 = this.tempMatrix4_3;
    const tempVector = this.tempVector;
    const tempScale = this.tempScale;

    tempMatrix4_2.identity();
    tempMatrix4_3.identity();

    for (let faceIndex in faces) {
      const face = faces[faceIndex];
      const mesh = this.meshes[faceIndex];
      const colors = mesh.geometry.getAttribute("instanceColor");
      let instanceCount = 0;

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

        const color = createColorFromLevel(level);
        colors.setXYZ(nodeIndex, color.r, color.g, color.b);

        colors.needsUpdate = true;

        // Set the instance matrix
        mesh.setMatrixAt(nodeIndex, tempMatrix4);
        instanceCount++;
      }

      // Update instance count
      mesh.count = instanceCount;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  getMeshes(): THREE.InstancedMesh[] {
    return this.meshes;
  }

  // Helper method to add meshes to a scene
  addToScene(scene: THREE.Scene): void {
    this.meshes.forEach((mesh) => scene.add(mesh));
  }

  // Helper method to remove meshes from a scene
  removeFromScene(scene: THREE.Scene): void {
    this.meshes.forEach((mesh) => scene.remove(mesh));
  }

  // Optional: Set wireframe mode
  setWireframe(enabled: boolean): void {
    this.meshes.forEach((mesh) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.wireframe = enabled;
    });
  }

  // Optional: Set face colors
  setFaceColor(faceIndex: number, color: THREE.Color | number): void {
    if (faceIndex >= 0 && faceIndex < this.meshes.length) {
      const material = this.meshes[faceIndex]
        .material as THREE.MeshBasicMaterial;
      material.color = new THREE.Color(color);
    }
  }

  // Optional: Set opacity for visualization
  setOpacity(opacity: number): void {
    this.meshes.forEach((mesh) => {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.transparent = opacity < 1;
      material.opacity = opacity;
    });
  }

  dispose(): void {
    // Clean up geometries and materials
    const geometry = this.meshes[0].geometry;
    this.meshes.forEach((mesh) => {
      (mesh.material as THREE.Material).dispose();
    });
    geometry.dispose();
  }
}
