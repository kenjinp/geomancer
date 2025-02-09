import * as THREE from "three";
import { CubeSphereQuadtree } from "./CubeSphereQuadtree";

export class TerrainInstancer {
  private static readonly INITIAL_CAPACITY = 1000; // Start with reasonable capacity
  private instancedMesh: THREE.InstancedMesh;
  private nodeTransforms: Map<number, THREE.Matrix4> = new Map();
  private color = new THREE.Color();
  private quadtree: CubeSphereQuadtree;
  private radius: number;
  private offset: THREE.Vector3;

  constructor(
    quadtree: CubeSphereQuadtree,
    options: { radius?: number; position?: THREE.Vector3 } = {}
  ) {
    this.quadtree = quadtree;
    this.radius = options.radius ?? 1;
    this.offset = options.position ?? new THREE.Vector3();

    // Create base geometry (subdivided plane for better normal calculations)
    const geometry = new THREE.PlaneGeometry(1, 1, 16, 16);

    // Create material with sphere-oriented shading
    const material = new THREE.MeshBasicMaterial({
      // color: 0x00ff00,
      // wireframe: true, // Helps see geometry
    });

    // Initialize with fixed capacity
    this.instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      TerrainInstancer.INITIAL_CAPACITY
    );
    this.instancedMesh.count = 0; // Start with 0 visible instances
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  public get mesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  private ensureCapacity(requiredSize: number) {
    if (requiredSize > this.instancedMesh.instanceMatrix.count) {
      // Create new mesh with doubled capacity
      const newCapacity = Math.max(
        requiredSize,
        this.instancedMesh.instanceMatrix.count * 2
      );

      const newMesh = new THREE.InstancedMesh(
        this.instancedMesh.geometry,
        this.instancedMesh.material,
        newCapacity
      );
      newMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      // Copy existing instance data
      for (let i = 0; i < this.instancedMesh.count; i++) {
        const matrix = new THREE.Matrix4();
        this.instancedMesh.getMatrixAt(i, matrix);
        newMesh.setMatrixAt(i, matrix);

        const color = new THREE.Color();
        this.instancedMesh.getColorAt(i, color);
        newMesh.setColorAt(i, color);
      }

      // Replace old mesh
      const oldMesh = this.instancedMesh;
      this.instancedMesh = newMesh;

      // Copy position/rotation/scale
      this.instancedMesh.position.copy(oldMesh.position);
      this.instancedMesh.rotation.copy(oldMesh.rotation);
      this.instancedMesh.scale.copy(oldMesh.scale);

      // Update count
      this.instancedMesh.count = oldMesh.count;

      // Dispose old mesh
      oldMesh.dispose();
    }
  }

  public update() {
    const visibleNodes = this.quadtree.getVisibleNodes();

    // Ensure we have enough capacity
    this.ensureCapacity(visibleNodes.length);

    this.processNodeUpdates(visibleNodes);
  }

  private processNodeUpdates(nodeIndices: number[]) {
    // Track used instances
    const usedInstances = new Set<number>();
    let instanceCount = 0;

    nodeIndices.forEach((nodeIndex) => {
      if (!this.nodeTransforms.has(nodeIndex)) {
        this.addInstance(nodeIndex);
      }
      usedInstances.add(nodeIndex);
      this.updateInstanceTransform(nodeIndex, instanceCount);
      instanceCount++;
    });

    // Remove orphaned instances
    this.nodeTransforms.forEach((_, key) => {
      if (!usedInstances.has(key)) {
        this.nodeTransforms.delete(key);
      }
    });

    // Update instance count
    this.instancedMesh.count = instanceCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private addInstance(nodeIndex: number) {
    const matrix = new THREE.Matrix4();
    this.nodeTransforms.set(nodeIndex, matrix);
  }

  private updateInstanceTransform(nodeIndex: number, instanceId: number) {
    const node = this.quadtree.getNodeView(nodeIndex);
    const matrix = this.nodeTransforms.get(nodeIndex)!;

    // Calculate tile size based on level
    const tileSize = (this.radius * 2) / (1 << node.level);
    const scale = new THREE.Vector3(tileSize, tileSize, 1);

    // Calculate normalized position within face (0 to 1)
    const u = (node.x + 0.5) / (1 << node.level);
    const v = (node.y + 0.5) / (1 << node.level);

    // Create face transformation matrix
    const faceMatrix = new THREE.Matrix4();
    const facePosition = new THREE.Vector3();

    switch (node.face) {
      case 0: // Front (+Z)
        facePosition.set(0, 0, this.radius);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new THREE.Matrix4().makeRotationY(0));
        break;
      case 1: // Back (-Z)
        facePosition.set(0, 0, -this.radius);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI));
        break;
      case 2: // Right (+X)
        facePosition.set(this.radius, 0, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        break;
      case 3: // Left (-X)
        facePosition.set(-this.radius, 0, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
        break;
      case 4: // Top (+Y)
        facePosition.set(0, this.radius, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        break;
      case 5: // Bottom (-Y)
        facePosition.set(0, -this.radius, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
        break;
    }

    // Create matrix for local position within face
    const localMatrix = new THREE.Matrix4();
    const localOffset = new THREE.Vector3(
      (u - 0.5) * 2 * this.radius,
      (v - 0.5) * 2 * this.radius,
      0
    );
    localMatrix.makeTranslation(localOffset.x, localOffset.y, localOffset.z);

    // Combine transformations: face position/orientation -> local offset -> world offset -> scale
    matrix
      .copy(faceMatrix)
      .multiply(localMatrix)
      .premultiply(
        new THREE.Matrix4().makeTranslation(
          this.offset.x,
          this.offset.y,
          this.offset.z
        )
      )
      .scale(scale);

    // Apply final matrix to instance
    this.instancedMesh.setMatrixAt(instanceId, matrix);

    // Set color based on cube face
    switch (node.face) {
      case 0:
        this.color.setHex(0xff4444);
        break;
      case 1:
        this.color.setHex(0x4444ff);
        break;
      case 2:
        this.color.setHex(0x44ff44);
        break;
      case 3:
        this.color.setHex(0xffff44);
        break;
      case 4:
        this.color.setHex(0x44ffff);
        break;
      case 5:
        this.color.setHex(0xff44ff);
        break;
    }
    this.instancedMesh.setColorAt(instanceId, this.color);
  }

  public dispose() {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.nodeTransforms.clear();
  }

  public setRadius(radius: number) {
    this.radius = radius;
  }

  public setPosition(position: THREE.Vector3) {
    this.offset.copy(position);
  }
}
