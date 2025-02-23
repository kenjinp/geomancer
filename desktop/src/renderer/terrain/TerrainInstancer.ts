import { H3CubeMapGenerator } from "@/lib/coordinate-systems/hex/maps/H3CubeMapGenerator";
import { HexNeighborMapGenerator } from "@/lib/coordinate-systems/hex/maps/HexNeighborMapGenerator";
import { HexPositionMapGenerator } from "@/lib/coordinate-systems/hex/maps/HexPositionMapGenerator";
import { HexGridFloodFill } from "@/lib/Hextree/FloodFill";
import { HexTileBuffer } from "@/lib/Hextree/HexTileBuffer";
import * as THREE from "three";
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
  private instancedMesh?: THREE.InstancedMesh;
  private nodeTransforms: Map<number, THREE.Matrix4> = new Map();
  private color = new THREE.Color();
  private quadtree: CubeSphereQuadtree;
  private radius: number;
  private offset: THREE.Vector3;
  private material: THREE.Material;
  private hexTileBuffer: HexTileBuffer = new HexTileBuffer(4);
  constructor(
    quadtree: CubeSphereQuadtree,
    options: { radius?: number; position?: THREE.Vector3 } = {}
  ) {
    this.quadtree = quadtree;
    this.radius = options.radius ?? 1;
    this.offset = options.position ?? new THREE.Vector3();
  }

  public async initialize() {
    const cubeFaceUrls = [
      "textures/hex/index-cube-map/face-0.webp",
      "textures/hex/index-cube-map/face-1.webp",
      "textures/hex/index-cube-map/face-2.webp",
      "textures/hex/index-cube-map/face-3.webp",
      "textures/hex/index-cube-map/face-4.webp",
      "textures/hex/index-cube-map/face-5.webp",
    ];
    const hexCubeMap = await H3CubeMapGenerator.loadFromWebPFiles(cubeFaceUrls);
    const h3NeighborMap = await HexNeighborMapGenerator.loadFromWebP(
      "textures/hex/neighbor-map.webp",
      4
    );
    const h3PositionMap = await HexPositionMapGenerator.loadFromBinary(
      "textures/hex/position-map.bin",
      4
    );

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSelectedTile: { value: -1 },
        uRadius: { value: this.radius },
        uOffset: { value: this.offset },
        h3IndexMap: { value: hexCubeMap.cubeTexture },
        h3NeighborMap: { value: h3NeighborMap.texture },
        h3PositionMap: { value: h3PositionMap.texture },
        uModelMatrix: { value: new THREE.Matrix4() },
        map: { value: null },
        hexTileIntBuffer: { value: this.hexTileBuffer.getIntegerTexture() },
        hexTileFloatBuffer: { value: this.hexTileBuffer.getFloatTexture() },
      },
      vertexColors: true,
    });

    this.generateTectonicPlateData();

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

  public update(camera: THREE.Camera) {
    if (!this.instancedMesh) {
      return;
    }
    const visibleNodes = this.quadtree.getVisibleNodes(
      camera,
      this.radius,
      this.offset
    );
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

    // Apply final matrix to instance
    this.instancedMesh.setMatrixAt(instanceId, matrix);
  }

  public dispose() {
    // dispose of all textures
    this.instancedMesh.material.uniforms.h3IndexMap.value.dispose();
    this.instancedMesh.material.uniforms.h3NeighborMap.value.dispose();
    this.instancedMesh.material.uniforms.h3PositionMap.value.dispose();
    this.instancedMesh.material.uniforms.hexTileIntBuffer.value.dispose();
    this.instancedMesh.material.uniforms.hexTileFloatBuffer.value.dispose();
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.nodeTransforms.clear();
  }

  public setRadius(radius: number, camera: THREE.Camera) {
    this.radius = radius;
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.uRadius.value = radius;
    this.processNodeUpdates(
      this.quadtree.getVisibleNodes(camera, radius, this.offset)
    );
  }

  public setSelectedTile(hexIndex: number | null) {
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.uSelectedTile.value = hexIndex || -1;
  }

  public setPosition(position: THREE.Vector3) {
    this.offset.copy(position);
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.uOffset.value = position;
  }

  public setTileData(hexTileBuffer: HexTileBuffer) {
    this.hexTileBuffer.copy(hexTileBuffer);
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.hexTileIntBuffer.value = this.hexTileBuffer.getIntegerTexture();
    (
      this.instancedMesh.material as THREE.ShaderMaterial
    ).uniforms.hexTileFloatBuffer.value = this.hexTileBuffer.getFloatTexture();
    this.instancedMesh.material.needsUpdate = true;
  }

  public generateTectonicPlateData(numberOfSeeds = 40) {
    HexGridFloodFill.doFloodfill(4, numberOfSeeds).then((hexGridFloodFill) => {
      this.setTileData(hexGridFloodFill.hexTileBuffer);
      // CrustAssignmentFloodFill.assignCrust(4, 12);
    });
  }
}
