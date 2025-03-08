import { getState, subscribe } from "@/state/Context";
import {
  Camera,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  MeshPhysicalMaterial,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from "three";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import fragmentShader from "../shaders/terrain/terrain.frag";
import { CubeSphereQuadtree } from "./CubeSphereQuadtree";

export class TerrainInstancer {
  private static readonly INITIAL_CAPACITY = 1000; // Start with reasonable capacity
  private instancedMesh?: InstancedMesh;
  private nodeTransforms: Map<number, Matrix4> = new Map();
  private quadtree: CubeSphereQuadtree;
  private radius: number;
  private offset: Vector3;
  private material: Material;
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

    // Create a custom vertex shader that handles sphere projection and shadow mapping
    const sphereProjectionVS = `
    uniform float uRadius;
    uniform vec3 uOffset;
    varying vec4 vWorldPosition;
    varying float vInstanceId;
    varying vec3 vColor;
    varying vec3 vSphereNormal;

    void main() {
      // Get instance ID
      vInstanceId = float(gl_InstanceID);
      
      // Calculate sphere-projected position
      vec4 instWorldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec3 sphereDir = normalize(instWorldPos.xyz - uOffset);
      vec3 spherePos = uOffset + sphereDir * uRadius;
      
      // Store for fragment shader and shadows
      vWorldPosition = vec4(spherePos, 1.0);
      vSphereNormal = sphereDir; // The normal is the same as the direction from center
      
      // This is the key part - we need to modify csm_Position with the right
      // transformation that makes the final position end up on the sphere
      vec4 spherePosView = viewMatrix * vec4(spherePos, 1.0);
      mat4 invModelViewMat = inverse(modelViewMatrix);
      mat4 invInstanceMat = inverse(instanceMatrix);
      vec4 objectSpacePos = invInstanceMat * invModelViewMat * spherePosView;
      
      // Set the position for rendering
      csm_Position = objectSpacePos.xyz;
      
      // Also update the normal to match the sphere surface
      // Since we're projecting onto a sphere, the normal is the normalized direction from center
      csm_Normal = normalize(sphereDir);
    }
    `;

    this.material = new CustomShaderMaterial({
      baseMaterial: MeshPhysicalMaterial,
      vertexShader: sphereProjectionVS,
      fragmentShader,
      depthWrite: true,
      depthTest: true,
      stencilWrite: false,
      transparent: false,
      opacity: 1.0,
      uniforms: {
        uMapMode: { value: mapMode },
        uMapLayers: { value: this.packMapLayers() },
        uSelectedTile: { value: -1 },
        uRadius: { value: this.radius },
        uOffset: { value: this.offset },
        h3IndexMap: { value: buffers.hexCubeMap.cubeTexture },
        h3NeighborMap: { value: buffers.hexNeighborMap.texture },
        h3PositionMap: { value: buffers.hexPositionMap.texture },
        uModelMatrix: { value: new Matrix4() },
        map: { value: null },
        hexTileIntBuffer: { value: buffers.hexTileBuffer.getIntegerTexture() },
        hexTileFloatBuffer: { value: buffers.hexTileBuffer.getFloatTexture() },
      },
      // Single focused patch for the worldPosition
      patchMap: {
        "*": {
          // Vertex shader patches
          "vec4 worldPosition = vec4( transformed, 1.0 );":
            "vec4 worldPosition = vWorldPosition;",
          "worldPosition = modelMatrix * worldPosition;":
            "/* Already in world space */",
          "vec4 shadowWorldPosition;":
            "vec4 shadowWorldPosition = vWorldPosition;",
          "#if ( defined( USE_SHADOWMAP ) && ( 0 > 0 || 0 > 0 ) ) || ( 0 > 0 )":
            "#if ( defined( USE_SHADOWMAP ) && ( 0 > 0 || 0 > 0 ) ) || ( 0 > 0 )\n  shadowWorldPosition = vWorldPosition;",
          "vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );":
            "vec3 shadowWorldNormal = vSphereNormal;",
        },
      },
    });

    subscribe((state) => {
      this.getMaterial().uniforms.uMapMode.value = state.mapMode;
      this.getMaterial().uniforms.uMapLayers.value = this.packMapLayers();
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

  public getMaterial(): ShaderMaterial {
    return this.material as ShaderMaterial;
  }

  public dispose() {
    // dispose of all textures
    const material = this.getMaterial();
    material.uniforms.h3IndexMap.value.dispose();
    material.uniforms.h3NeighborMap.value.dispose();
    material.uniforms.h3PositionMap.value.dispose();
    material.uniforms.hexTileIntBuffer.value.dispose();
    material.uniforms.hexTileFloatBuffer.value.dispose();
    this.instancedMesh.geometry.dispose();
    material.dispose();
    this.nodeTransforms.clear();
  }

  public setRadius(radius: number, camera: Camera) {
    this.radius = radius;
    this.getMaterial().uniforms.uRadius.value = radius;
    this.processNodeUpdates(
      this.quadtree.getVisibleNodes(camera, radius, this.offset)
    );
    this.getMaterial().needsUpdate = true;
  }

  public setSelectedTile(hexIndex: number | null) {
    this.getMaterial().uniforms.uSelectedTile.value = hexIndex || -1;
  }

  public setPosition(position: Vector3) {
    this.offset.copy(position);
    this.getMaterial().uniforms.uOffset.value = position;
  }

  public updateCubeMapFromContext() {
    const buffers = getState().buffers;
    this.getMaterial().uniforms.h3IndexMap.value =
      buffers.hexCubeMap.cubeTexture;
    this.getMaterial().needsUpdate = true;
  }

  public updateNeighborMapFromContext() {
    const buffers = getState().buffers;
    this.getMaterial().uniforms.h3NeighborMap.value =
      buffers.hexNeighborMap.texture;
    this.getMaterial().needsUpdate = true;
  }

  public updatePositionMapFromContext() {
    const buffers = getState().buffers;
    this.getMaterial().uniforms.h3PositionMap.value =
      buffers.hexPositionMap.texture;
    this.getMaterial().needsUpdate = true;
  }

  public updateTileBufferFromContext() {
    const buffers = getState().buffers;
    const material = this.getMaterial();
    material.uniforms.hexTileIntBuffer.value =
      buffers.hexTileBuffer.getIntegerTexture();
    material.uniforms.hexTileFloatBuffer.value =
      buffers.hexTileBuffer.getFloatTexture();
    this.getMaterial().needsUpdate = true;
  }
}
