import {
  Camera,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  Vector3,
} from "three/webgpu";

import { getState, MapLayer, subscribe } from "@/state/Context";

import { createTerrainMaterial } from "./nodes/material";
import { prepareH3CubeTextureForWebGPU } from "./nodes/prepareH3CubeTexture";
import type { TerrainUniformNodes } from "./nodes/uniforms";
import { CubeSphereQuadtree } from "./CubeSphereQuadtree";

export class TerrainInstancer {
  private static readonly INITIAL_CAPACITY = 1000;
  private instancedMesh?: InstancedMesh;
  private nodeTransforms: Map<number, Matrix4> = new Map();
  private quadtree: CubeSphereQuadtree;
  private radius: number;
  private offset: Vector3;
  private material!: MeshStandardNodeMaterial;
  private uniforms!: TerrainUniformNodes;

  constructor(quadtree: CubeSphereQuadtree) {
    this.quadtree = quadtree;
    this.radius = getState().planetology.radius;
    this.offset = getState().transform.offset;
  }

  packMapLayers() {
    const { mapLayers } = getState();
    return mapLayers.reduce((acc, layer) => acc | (1 << layer), 0);
  }

  private isMapLayerEnabled(layer: MapLayer): boolean {
    return getState().mapLayers.includes(layer);
  }

  private syncLightingAndShadows() {
    const useLighting = this.isMapLayerEnabled(MapLayer.REALISTIC_LIGHTING);
    const useShadows = useLighting;
    this.material.lights = useLighting;
    if (this.instancedMesh) {
      this.instancedMesh.receiveShadow = useShadows;
      this.instancedMesh.castShadow = true;
    }
  }

  public async initialize() {
    const { buffers, mapMode } = getState();
    const mapLayers = this.packMapLayers();

    const { material, uniforms } = createTerrainMaterial({
      uMapMode: mapMode,
      uMapLayers: mapLayers,
      uSelectedTile: -1,
      uRadius: this.radius,
      uOffset: this.offset,
      h3IndexMap: prepareH3CubeTextureForWebGPU(buffers.hexCubeMap.cubeTexture!),
      h3NeighborMap: buffers.hexNeighborMap.texture,
      h3PositionMap: buffers.hexPositionMap.texture,
      uModelMatrix: new Matrix4(),
      hexTileIntBuffer: buffers.hexTileBuffer.getIntegerTexture(),
      hexTileFloatBuffer: buffers.hexTileBuffer.getFloatTexture(),
      uHexJitterAmount: 0.0015,
      uApplyHexJitter: 1,
    });

    this.material = material;
    this.uniforms = uniforms;

    subscribe((state) => {
      this.uniforms.uMapMode.value = state.mapMode;
      this.uniforms.uMapLayers.value = this.packMapLayers();
      this.syncLightingAndShadows();
      this.updateCubeMapFromContext();
      this.updateNeighborMapFromContext();
      this.updatePositionMapFromContext();
      this.updateTileBufferFromContext();
    });

    this.instancedMesh = new InstancedMesh(
      new PlaneGeometry(1, 1, 16, 16),
      this.material,
      TerrainInstancer.INITIAL_CAPACITY,
    );

    this.syncLightingAndShadows();

    const colors = new Float32Array(TerrainInstancer.INITIAL_CAPACITY * 3);
    this.instancedMesh.geometry.setAttribute(
      "instanceColor",
      new InstancedBufferAttribute(colors, 3, false, 1),
    );

    this.instancedMesh.count = 0;
    this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }

  public get mesh(): InstancedMesh {
    return this.instancedMesh!;
  }

  private ensureCapacity(requiredSize: number) {
    if (requiredSize > this.instancedMesh!.instanceMatrix.count) {
      const newCapacity = Math.max(requiredSize, this.instancedMesh!.instanceMatrix.count * 2);

      const newMesh = new InstancedMesh(
        this.instancedMesh!.geometry,
        this.instancedMesh!.material,
        newCapacity,
      );
      newMesh.instanceMatrix.setUsage(DynamicDrawUsage);

      for (let i = 0; i < this.instancedMesh!.count; i++) {
        const matrix = new Matrix4();
        this.instancedMesh!.getMatrixAt(i, matrix);
        newMesh.setMatrixAt(i, matrix);

        const color = new Color();
        this.instancedMesh!.getColorAt(i, color);
        newMesh.setColorAt(i, color);
      }

      const oldMesh = this.instancedMesh!;
      this.instancedMesh = newMesh;

      this.instancedMesh.position.copy(oldMesh.position);
      this.instancedMesh.rotation.copy(oldMesh.rotation);
      this.instancedMesh.scale.copy(oldMesh.scale);
      this.instancedMesh.count = oldMesh.count;

      oldMesh.dispose();
    }
  }

  public update(camera: Camera) {
    if (!this.instancedMesh) {
      return;
    }
    const visibleNodes = this.quadtree.getVisibleNodes(camera, this.radius, this.offset);
    this.ensureCapacity(visibleNodes.length);
    this.processNodeUpdates(visibleNodes);
  }

  private processNodeUpdates(nodeIndices: number[]) {
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

    this.nodeTransforms.forEach((_, key) => {
      if (!usedInstances.has(key)) {
        this.nodeTransforms.delete(key);
      }
    });

    this.instancedMesh!.count = instanceCount;
    this.instancedMesh!.instanceMatrix.needsUpdate = true;
  }

  private addInstance(nodeIndex: number) {
    this.nodeTransforms.set(nodeIndex, new Matrix4());
  }

  private updateInstanceTransform(nodeIndex: number, instanceId: number) {
    const node = this.quadtree.getNodeView(nodeIndex);
    const matrix = this.nodeTransforms.get(nodeIndex)!;

    const tileSize = (this.radius * 2) / (1 << node.level);
    const scale = new Vector3(tileSize, tileSize, 1);

    const u = (node.x + 0.5) / (1 << node.level);
    const v = (node.y + 0.5) / (1 << node.level);

    const faceMatrix = new Matrix4();
    const facePosition = new Vector3();

    switch (node.face) {
      case 0:
        facePosition.set(0, 0, this.radius);
        faceMatrix.makeTranslation(facePosition.x, facePosition.y, facePosition.z);
        break;
      case 1:
        facePosition.set(0, 0, -this.radius);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationY(Math.PI));
        break;
      case 2:
        facePosition.set(this.radius, 0, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationY(Math.PI / 2));
        break;
      case 3:
        facePosition.set(-this.radius, 0, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationY(-Math.PI / 2));
        break;
      case 4:
        facePosition.set(0, this.radius, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationX(-Math.PI / 2));
        break;
      case 5:
        facePosition.set(0, -this.radius, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationX(Math.PI / 2));
        break;
    }

    const localMatrix = new Matrix4();
    const localOffset = new Vector3((u - 0.5) * 2 * this.radius, (v - 0.5) * 2 * this.radius, 0);
    localMatrix.makeTranslation(localOffset.x, localOffset.y, localOffset.z);

    matrix
      .makeTranslation(this.offset.x, this.offset.y, this.offset.z)
      .multiply(faceMatrix)
      .multiply(localMatrix)
      .scale(scale);

    this.instancedMesh!.setMatrixAt(instanceId, matrix);
  }

  public getMaterial(): MeshStandardNodeMaterial {
    return this.material;
  }

  public dispose() {
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
    }
    this.material?.dispose();
    this.nodeTransforms.clear();
  }

  public setRadius(radius: number, camera: Camera) {
    this.radius = radius;
    this.uniforms.uRadius.value = radius;
    this.processNodeUpdates(this.quadtree.getVisibleNodes(camera, radius, this.offset));
    this.material.needsUpdate = true;
  }

  public setSelectedTile(hexIndex: number | null) {
    this.uniforms.uSelectedTile.value = hexIndex ?? -1;
  }

  public setPosition(position: Vector3) {
    this.offset.copy(position);
    this.uniforms.uOffset.value = position;
  }

  public updateCubeMapFromContext() {
    const buffers = getState().buffers;
    const cube = buffers.hexCubeMap.cubeTexture;
    if (cube) {
      this.uniforms.h3IndexMap.value = prepareH3CubeTextureForWebGPU(cube);
      this.material.needsUpdate = true;
    }
  }

  public updateNeighborMapFromContext() {
    const buffers = getState().buffers;
    this.uniforms.h3NeighborMap.value = buffers.hexNeighborMap.texture;
    this.material.needsUpdate = true;
  }

  public updatePositionMapFromContext() {
    const buffers = getState().buffers;
    this.uniforms.h3PositionMap.value = buffers.hexPositionMap.texture;
    this.material.needsUpdate = true;
  }

  public updateTileBufferFromContext() {
    const buffers = getState().buffers;
    this.uniforms.hexTileIntBuffer.value = buffers.hexTileBuffer.getIntegerTexture();
    this.uniforms.hexTileFloatBuffer.value = buffers.hexTileBuffer.getFloatTexture();
    this.material.needsUpdate = true;
  }
}
