import * as THREE from "three";
import { CubeSphereQuadtree } from "./CubeSphereQuadtree";

export class TerrainInstancer {
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
      color: 0x00ff00,
      wireframe: true, // Helps see geometry
    });

    // Initialize instanced mesh with conservative estimate
    this.instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      this.quadtree.getVisibleNodes().length
    );
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  public get mesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  public update() {
    const visibleNodes = this.quadtree.getVisibleNodes();
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

    // Update instance count and matrices
    this.instancedMesh.count = instanceCount;
    console.log("Instance count:", instanceCount);
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private addInstance(nodeIndex: number) {
    const matrix = new THREE.Matrix4();
    this.nodeTransforms.set(nodeIndex, matrix);
  }

  private updateInstanceTransform(nodeIndex: number, instanceId: number) {
    const node = this.quadtree["getNodeView"](nodeIndex);
    const matrix = this.nodeTransforms.get(nodeIndex)!;

    // Get unit sphere position and scale it
    const unitPosition = new THREE.Vector3(...node.spherePos);
    const worldPosition = unitPosition
      .multiplyScalar(this.radius)
      .add(this.offset);

    // Add slight offset based on face to prevent z-fighting
    const faceOffset = unitPosition.clone().multiplyScalar(0.01);
    worldPosition.add(faceOffset);

    const scale = this.radius / (1 << node.level);

    // Get face orientation from quadtree
    const faceRotation = this.getFaceRotation(node.face);
    const rotation = new THREE.Quaternion().setFromEuler(faceRotation);

    // Compose matrix
    matrix.compose(
      worldPosition,
      rotation,
      new THREE.Vector3(scale, scale, scale)
    );

    // Update instance matrix
    this.instancedMesh.setMatrixAt(instanceId, matrix);

    // Set color based on face
    const hue = node.face / 6; // Different color per face
    this.color.setHSL(hue, 0.8, 0.5);
    this.instancedMesh.setColorAt(instanceId, this.color);
  }

  private getFaceRotation(face: number): THREE.Euler {
    // Corrected face rotations
    switch (face) {
      case 0: // Front (+X)
        return new THREE.Euler(0, -Math.PI / 2, 0);
      case 1: // Back (-X)
        return new THREE.Euler(0, Math.PI / 2, 0);
      case 2: // Right (+Y)
        return new THREE.Euler(0, 0, 0);
      case 3: // Left (-Y)
        return new THREE.Euler(0, Math.PI, 0);
      case 4: // Top (+Z)
        return new THREE.Euler(-Math.PI / 2, 0, 0);
      case 5: // Bottom (-Z)
        return new THREE.Euler(Math.PI / 2, 0, 0);
      default:
        return new THREE.Euler();
    }
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
