import * as THREE from "three";
import { CubicQuadtree } from "./CubicQuadtree";

export class QuadtreeRenderer {
  private meshes: THREE.InstancedMesh[];
  private readonly tempMatrix4 = new THREE.Matrix4();
  private readonly tempMatrix4_2 = new THREE.Matrix4();
  private readonly tempMatrix4_3 = new THREE.Matrix4();
  private readonly tempVector = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();

  constructor(private quadtree: CubicQuadtree) {
    // Create base plane geometry that will be instanced
    const segmentsPerChunk = 32;
    const planeGeometry = new THREE.PlaneGeometry(
      1,
      1,
      segmentsPerChunk,
      segmentsPerChunk
    );

    // Create materials for each face with different colors
    const materials = [
      new THREE.MeshBasicMaterial({
        color: 0xff0000,
        side: THREE.DoubleSide,
        wireframe: true,
      }), // Right
      new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        side: THREE.DoubleSide,
        wireframe: true,
      }), // Left
      new THREE.MeshBasicMaterial({
        color: 0x0000ff,
        side: THREE.DoubleSide,
        wireframe: true,
      }), // Top
      new THREE.MeshBasicMaterial({
        color: 0xff00ff,
        side: THREE.DoubleSide,
        wireframe: true,
      }), // Bottom
      new THREE.MeshBasicMaterial({
        color: 0xffff00,
        side: THREE.DoubleSide,
        wireframe: true,
      }), // Front
      new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        side: THREE.DoubleSide,
        wireframe: true,
      }), // Back
    ];

    // Initialize instance matrices for each face
    this.meshes = materials.map((material) => {
      // Start with a reasonable maximum instance count
      const mesh = new THREE.InstancedMesh(planeGeometry, material, 1_000);
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
      let instanceCount = 0;

      // Iterate through all nodes in the face's quadtree

      for (let nodeIndex = 0; nodeIndex < face.nodeBuffer.size; nodeIndex++) {
        // Get node properties
        const center = face.nodeBuffer.getCenter(nodeIndex, tempVector);
        const size = face.nodeBuffer.getSize(nodeIndex, tempScale);

        // Set matrix transformation
        tempMatrix4
          .identity()
          .multiply(face.localToWorld) // Apply face orientation
          .multiply(tempMatrix4_2.makeTranslation(center.x, center.y, center.z)) // Position
          .multiply(tempMatrix4_3.makeScale(size.x, size.y, 1)); // Scale (z=1 since we're using a plane)

        // Set the instance matrix
        mesh.setMatrixAt(instanceCount, tempMatrix4);
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
