import { getState, subscribe } from "@/state/Context";
import {
  Camera,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { ShaderPatch, ShaderUtils } from "../../utils/shader.utils";
import beginVertex from "../shaders/terrain/chunks/begin_vertex.glsl";
import beginnormalVertex from "../shaders/terrain/chunks/beginnormal_vertex.glsl";
import fragmentDeclarations from "../shaders/terrain/chunks/declarations.frag.glsl";
import vertexDeclarations from "../shaders/terrain/chunks/declarations.vert.glsl";
import normalFragmentBegin from "../shaders/terrain/chunks/normal_fragment_begin.glsl";
import outputFragment from "../shaders/terrain/chunks/output_fragment.glsl";
import projectVertex from "../shaders/terrain/chunks/project_vertex.glsl";
import worldPositionVertex from "../shaders/terrain/chunks/worldPosition_vertex.glsl";
import { CubeSphereQuadtree } from "./CubeSphereQuadtree";

// Extended interface for Physical Material with custom uniforms
interface TerrainMaterial extends MeshPhysicalMaterial {
  customUniforms?: {
    uMapMode: { value: number };
    uMapLayers: { value: number };
    uSelectedTile: { value: number };
    uRadius: { value: number };
    uOffset: { value: Vector3 };
    h3IndexMap: { value: any };
    h3NeighborMap: { value: any };
    h3PositionMap: { value: any };
    uModelMatrix: { value: Matrix4 };
    hexTileIntBuffer: { value: any };
    hexTileFloatBuffer: { value: any };
  };
}

export class TerrainInstancer {
  private static readonly INITIAL_CAPACITY = 1000; // Start with reasonable capacity
  private instancedMesh?: InstancedMesh;
  private nodeTransforms: Map<number, Matrix4> = new Map();
  private quadtree: CubeSphereQuadtree;
  private radius: number;
  private offset: Vector3;
  private material: TerrainMaterial;
  constructor(quadtree: CubeSphereQuadtree) {
    this.quadtree = quadtree;
    this.radius = getState().planetology.radius;
    this.offset = getState().transform.offset;
  }

  packMapLayers() {
    const { mapLayers } = getState();
    // use bitpacking to pack the map layers into a single number
    return mapLayers.reduce((acc, layer) => acc | (1 << layer), 0);
  }

  public async initialize() {
    const { buffers, mapMode } = getState();

    // Create custom uniforms
    const customUniforms = {
      uMapMode: { value: mapMode },
      uMapLayers: { value: this.packMapLayers() },
      uSelectedTile: { value: -1 },
      uRadius: { value: this.radius },
      uOffset: { value: this.offset },
      h3IndexMap: { value: buffers.hexCubeMap.cubeTexture },
      h3NeighborMap: { value: buffers.hexNeighborMap.texture },
      h3PositionMap: { value: buffers.hexPositionMap.texture },
      uModelMatrix: { value: new Matrix4() },
      hexTileIntBuffer: { value: buffers.hexTileBuffer.getIntegerTexture() },
      hexTileFloatBuffer: { value: buffers.hexTileBuffer.getFloatTexture() },
    };

    // Create physical material
    this.material = new MeshPhysicalMaterial({
      roughness: 0.5,
      metalness: 0.0,
      color: new Color(1, 1, 1),
    }) as TerrainMaterial;

    // Store the custom uniforms directly on the material
    this.material.customUniforms = customUniforms;

    // Define shader patches
    const vertexPatches: ShaderPatch[] = [
      {
        chunk: "", // Empty chunk means this is a global definition
        glsl: vertexDeclarations,
        mode: "replace",
        isGlobalDefinition: true,
      },
      {
        chunk: "#include <beginnormal_vertex>",
        glsl: beginnormalVertex,
        mode: "replace",
      },
      {
        chunk: "#include <begin_vertex>",
        glsl: beginVertex,
        mode: "replace",
      },
      {
        chunk: "#include <project_vertex>",
        glsl: projectVertex,
        mode: "replace",
      },
      {
        chunk: "vec4 worldPosition = vec4( transformed, 1.0 );",
        glsl: worldPositionVertex,
        mode: "replace",
      },
    ];

    const fragmentPatches: ShaderPatch[] = [
      {
        chunk: "", // Empty chunk means this is a global definition
        glsl: fragmentDeclarations,
        mode: "replace",
        isGlobalDefinition: true,
      },
      {
        chunk: "#include <normal_fragment_begin>",
        glsl: normalFragmentBegin,
        mode: "replace",
      },
      {
        chunk: "#include <output_fragment>",
        glsl: outputFragment,
        mode: "replace",
      },
    ];

    // Modify shader via onBeforeCompile using ShaderUtils
    this.material.onBeforeCompile = (shader) => {
      ShaderUtils.patchShader(
        shader,
        vertexPatches,
        fragmentPatches,
        customUniforms
      );

      // For debugging
      console.log("Modified vertex shader:", shader.vertexShader);
      console.log("Modified fragment shader:", shader.fragmentShader);
    };

    // Set needsUpdate to trigger shader compilation
    this.material.needsUpdate = true;

    // Subscribe to state changes
    subscribe((state) => {
      if (this.material.customUniforms) {
        this.material.customUniforms.uMapMode.value = state.mapMode;
        this.material.customUniforms.uMapLayers.value = this.packMapLayers();
      }
      this.updateCubeMapFromContext();
      this.updateNeighborMapFromContext();
      this.updatePositionMapFromContext();
      this.updateTileBufferFromContext();
    });

    // Initialize instanced mesh
    this.instancedMesh = new InstancedMesh(
      new PlaneGeometry(1, 1, 16, 16),
      this.material,
      TerrainInstancer.INITIAL_CAPACITY
    );

    // Enable shadow receiving and casting
    this.instancedMesh.receiveShadow = true;
    this.instancedMesh.castShadow = true;

    // Add instance color attribute
    const colors = new Float32Array(TerrainInstancer.INITIAL_CAPACITY * 3);
    this.instancedMesh.geometry.setAttribute(
      "instanceColor",
      new InstancedBufferAttribute(colors, 3, false, 1)
    );

    this.instancedMesh.count = 0; // Start with 0 visible instances
    this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  }

  public get mesh(): InstancedMesh {
    return this.instancedMesh;
  }

  private ensureCapacity(requiredSize: number) {
    if (requiredSize > this.instancedMesh.instanceMatrix.count) {
      // Create new mesh with doubled capacity
      const newCapacity = Math.max(
        requiredSize,
        this.instancedMesh.instanceMatrix.count * 2
      );

      const newMesh = new InstancedMesh(
        this.instancedMesh.geometry,
        this.instancedMesh.material,
        newCapacity
      );
      newMesh.instanceMatrix.setUsage(DynamicDrawUsage);

      // Copy existing instance data
      for (let i = 0; i < this.instancedMesh.count; i++) {
        const matrix = new Matrix4();
        this.instancedMesh.getMatrixAt(i, matrix);
        newMesh.setMatrixAt(i, matrix);

        const color = new Color();
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

  public update(camera: Camera) {
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
    const matrix = new Matrix4();
    this.nodeTransforms.set(nodeIndex, matrix);
  }

  private updateInstanceTransform(nodeIndex: number, instanceId: number) {
    const node = this.quadtree.getNodeView(nodeIndex);
    const matrix = this.nodeTransforms.get(nodeIndex)!;

    // Calculate tile size based on level
    const tileSize = (this.radius * 2) / (1 << node.level);
    const scale = new Vector3(tileSize, tileSize, 1);

    // Calculate normalized position within face (0 to 1)
    const u = (node.x + 0.5) / (1 << node.level);
    const v = (node.y + 0.5) / (1 << node.level);

    // Create face transformation matrix
    const faceMatrix = new Matrix4();
    const facePosition = new Vector3();

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
          .multiply(new Matrix4().makeRotationY(Math.PI));
        break;
      case 2: // Right (+X)
        facePosition.set(this.radius, 0, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationY(Math.PI / 2));
        break;
      case 3: // Left (-X)
        facePosition.set(-this.radius, 0, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationY(-Math.PI / 2));
        break;
      case 4: // Top (+Y)
        facePosition.set(0, this.radius, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationX(-Math.PI / 2));
        break;
      case 5: // Bottom (-Y)
        facePosition.set(0, -this.radius, 0);
        faceMatrix
          .makeTranslation(facePosition.x, facePosition.y, facePosition.z)
          .multiply(new Matrix4().makeRotationX(Math.PI / 2));
        break;
    }

    // Create matrix for local position within face
    const localMatrix = new Matrix4();
    const localOffset = new Vector3(
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

  public getMaterial(): TerrainMaterial {
    return this.material;
  }

  public dispose() {
    // dispose of all textures
    if (this.material.customUniforms) {
      this.material.customUniforms.h3IndexMap.value.dispose();
      this.material.customUniforms.h3NeighborMap.value.dispose();
      this.material.customUniforms.h3PositionMap.value.dispose();
      this.material.customUniforms.hexTileIntBuffer.value.dispose();
      this.material.customUniforms.hexTileFloatBuffer.value.dispose();
    }
    if (this.instancedMesh) {
      this.instancedMesh.geometry.dispose();
    }
    this.material.dispose();
    this.nodeTransforms.clear();
  }

  public setRadius(radius: number, camera: Camera) {
    this.radius = radius;

    if (this.material.customUniforms) {
      this.material.customUniforms.uRadius.value = radius;
    }

    this.processNodeUpdates(
      this.quadtree.getVisibleNodes(camera, radius, this.offset)
    );

    this.material.needsUpdate = true;
  }

  public setSelectedTile(hexIndex: number | null) {
    if (this.material.customUniforms) {
      this.material.customUniforms.uSelectedTile.value = hexIndex || -1;
    }
  }

  public setPosition(position: Vector3) {
    this.offset.copy(position);

    if (this.material.customUniforms) {
      this.material.customUniforms.uOffset.value = position;
    }
  }

  public updateCubeMapFromContext() {
    const buffers = getState().buffers;

    if (this.material.customUniforms) {
      this.material.customUniforms.h3IndexMap.value =
        buffers.hexCubeMap.cubeTexture;
      this.material.needsUpdate = true;
    }
  }

  public updateNeighborMapFromContext() {
    const buffers = getState().buffers;

    if (this.material.customUniforms) {
      this.material.customUniforms.h3NeighborMap.value =
        buffers.hexNeighborMap.texture;
      this.material.needsUpdate = true;
    }
  }

  public updatePositionMapFromContext() {
    const buffers = getState().buffers;

    if (this.material.customUniforms) {
      this.material.customUniforms.h3PositionMap.value =
        buffers.hexPositionMap.texture;
      this.material.needsUpdate = true;
    }
  }

  public updateTileBufferFromContext() {
    const buffers = getState().buffers;

    if (this.material.customUniforms) {
      this.material.customUniforms.hexTileIntBuffer.value =
        buffers.hexTileBuffer.getIntegerTexture();
      this.material.customUniforms.hexTileFloatBuffer.value =
        buffers.hexTileBuffer.getFloatTexture();
      this.material.needsUpdate = true;
    }
  }
}
