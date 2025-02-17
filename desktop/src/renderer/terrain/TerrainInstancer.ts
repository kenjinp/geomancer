import { generateH3PositionTexture } from "@/lib/coordinate-systems/hex/maps/HexPositions";
import { generateH3CubeMap } from "@/lib/coordinate-systems/hex/maps/HexUVCubeMap";
import * as THREE from "three";
import { generateH3NeighborTexture } from "./CubeMap";
import { CubeSphereQuadtree } from "./CubeSphereQuadtree";
import fragmentShader from "./terrain.frag";
import vertexShader from "./terrain.vert";

const faceColors = [
  new THREE.Color(0xff4444), // Front
  new THREE.Color(0x4444ff), // Back
  new THREE.Color(0x44ff44), // Right
  new THREE.Color(0xffff44), // Left
  new THREE.Color(0x44ffff), // Top
  new THREE.Color(0xff44ff), // Bottom
];

export class TerrainInstancer {
  private static readonly INITIAL_CAPACITY = 1000; // Start with reasonable capacity
  private instancedMesh: THREE.InstancedMesh;
  private nodeTransforms: Map<number, THREE.Matrix4> = new Map();
  private color = new THREE.Color();
  private quadtree: CubeSphereQuadtree;
  private radius: number;
  private offset: THREE.Vector3;
  private material: THREE.Material;
  constructor(
    quadtree: CubeSphereQuadtree,
    options: { radius?: number; position?: THREE.Vector3 } = {}
  ) {
    this.quadtree = quadtree;
    this.radius = options.radius ?? 1;
    this.offset = options.position ?? new THREE.Vector3();

    const time1 = performance.now();
    const h3IndexMap = generateH3CubeMap();
    console.log(`h3IndexMap generation time: ${performance.now() - time1}ms`);

    const time2 = performance.now();
    const h3NeighborMap = generateH3NeighborTexture();
    console.log(
      `h3NeighborMap generation time: ${performance.now() - time2}ms`
    );

    const time3 = performance.now();
    const h3PositionMap = generateH3PositionTexture();
    console.log(
      `h3PositionMap generation time: ${performance.now() - time3}ms`
    );

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uRadius: { value: this.radius },
        uOffset: { value: this.offset },
        h3IndexMap: { value: h3IndexMap },
        h3NeighborMap: { value: h3NeighborMap },
        h3PositionMap: { value: h3PositionMap },
        uModelMatrix: { value: new THREE.Matrix4() },
        map: { value: null },
      },
      vertexColors: true,
    });
    // this.material = new THREE.MeshBasicMaterial();
    // (this.material as THREE.ShaderMaterial).uniforms = {
    //   uRadius: { value: this.radius },
    //   uOffset: { value: this.offset },
    // };

    // Initialize instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1, 16, 16),
      this.material,
      TerrainInstancer.INITIAL_CAPACITY
    );

    // Add instance color attribute
    const colors = new Float32Array(TerrainInstancer.INITIAL_CAPACITY * 3);
    this.instancedMesh.geometry.setAttribute(
      "instanceColor",
      new THREE.InstancedBufferAttribute(colors, 3, false, 1)
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

  public update(camera: THREE.Camera, hoveredNodeIndex: number | null = null) {
    const visibleNodes = this.quadtree.getVisibleNodes(
      camera,
      this.radius,
      this.offset
    );
    this.ensureCapacity(visibleNodes.length);
    this.processNodeUpdates(visibleNodes, hoveredNodeIndex);
  }

  private processNodeUpdates(
    nodeIndices: number[],
    hoveredNodeIndex: number | null
  ) {
    // Track used instances
    const usedInstances = new Set<number>();
    let instanceCount = 0;

    nodeIndices.forEach((nodeIndex) => {
      if (!this.nodeTransforms.has(nodeIndex)) {
        this.addInstance(nodeIndex);
      }
      usedInstances.add(nodeIndex);
      this.updateInstanceTransform(nodeIndex, instanceCount, hoveredNodeIndex);
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
    this.instancedMesh.instanceColor!.needsUpdate = true;
  }

  private addInstance(nodeIndex: number) {
    const matrix = new THREE.Matrix4();
    this.nodeTransforms.set(nodeIndex, matrix);
  }

  private updateInstanceTransform(
    nodeIndex: number,
    instanceId: number,
    hoveredNodeIndex: number | null
  ) {
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

    // Corrected face orientation and position mapping
    switch (node.face) {
      case 0: // Front (+Z)
        facePosition.set(0, 0, this.radius);
        faceMatrix.makeTranslation(
          facePosition.x,
          facePosition.y,
          facePosition.z
        );
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

    // Correct matrix composition order: (offset) × (face) × (local)
    matrix
      .makeTranslation(this.offset.x, this.offset.y, this.offset.z)
      .multiply(faceMatrix)
      .multiply(localMatrix)
      .scale(scale);

    // Set color based on hover state
    if (nodeIndex === hoveredNodeIndex) {
      this.color.set(0xff0000); // Red for hovered node
    } else {
      // Create color gradient based on subdivision level (0 = dark, maxDepth = bright)

      const baseColor = faceColors[node.face].clone();
      const depthFactor = node.level / this.quadtree.maxDepth;

      // Mix with white based on depth
      baseColor.lerp(new THREE.Color(0xffffff), depthFactor * 0.7);

      // Add variation based on level
      const levelIntensity = 0.2 + depthFactor * 0.8;
      baseColor.multiplyScalar(levelIntensity);

      this.color.copy(baseColor);
    }

    for (let neighborIndex of node.neighbors) {
      if (neighborIndex === hoveredNodeIndex) {
        this.color.set(0x4444ff);
        break;
      }
    }

    this.instancedMesh.setColorAt(instanceId, this.color);

    // Apply final matrix to instance
    this.instancedMesh.setMatrixAt(instanceId, matrix);
  }

  public dispose() {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.nodeTransforms.clear();
  }

  public setRadius(radius: number, camera: THREE.Camera) {
    this.radius = radius;
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.uRadius.value = radius;
    console.log("setting radius", radius);
    // Force update neighbor calculations
    this.processNodeUpdates(
      this.quadtree.getVisibleNodes(camera, radius, this.offset),
      null
    );
  }

  public setPosition(position: THREE.Vector3) {
    this.offset.copy(position);
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.uOffset.value = position;
  }
}
