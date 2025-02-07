import * as THREE from "three";
import { CubeFace, NODE_STRIDE, PlanetaryQuadtree } from "./QuadtreeSystem";

export class TerrainInstancer {
  private instancedMesh: THREE.InstancedMesh;
  // private matrixWorld = new THREE.Matrix4();
  // private tempBox = new THREE.Box3();
  private nodeHelper = new THREE.Object3D();

  constructor(
    private quadtree: PlanetaryQuadtree,
    private planetRadius: number = 6378137
  ) {
    this.instancedMesh = this.createInstancedMesh();
  }

  public get mesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  private createInstancedMesh(): THREE.InstancedMesh {
    const geometry = new THREE.PlaneGeometry(1, 1, 8, 8);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: this.planetRadius },
      },
      side: THREE.DoubleSide,
      // wireframe: true,
      vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vTileColor;
      uniform float uRadius;

      // Hash function for random color
      float hash(float n) {
          return fract(sin(n) * 43758.5453123);
      }

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

      vec3 getRandomColor(int id) {
          float f = float(id);
          return vec3(
              hash(f),
              hash(f + 1.0), 
              hash(f + 2.0)
          );
      }

      void main() {
          int instanceId = gl_InstanceID;
          vTileColor = getRandomColor(instanceId);
           vec3 bentPosition = bendInstancedToSphere(
              position,
              instanceMatrix,
              vec3(0.0),
              uRadius
          );

          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
          // gl_Position = bentPosition;
      }
  `,
      fragmentShader: `
      varying vec3 vWorldPosition;
      varying vec3 vTileColor;
      void main() {
          vec3 normal = normalize(vWorldPosition);
          // gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
          gl_FragColor = vec4(vTileColor, 1.0);
      }
  `,
    });

    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      this.quadtree.bufferSize
    );
    mesh.frustumCulled = false;
    return mesh;
  }

  public update(camera: THREE.Camera) {
    // this.quadtree.reset();
    this.quadtree.updateLOD(camera.position);
    this.updateInstanceMatrices();
  }

  // private updateInstanceMatrices() {
  //   const count = this.quadtree.activeNodeCount;
  //   this.instancedMesh.count = count;

  //   const nodes = this.quadtree.getActiveNodes();
  //   nodes.forEach((nodeIndex, instanceId) => {
  //     this.nodeHelper.matrixWorld = this.calculateNodeMatrix(nodeIndex);
  //     this.nodeHelper.updateMatrixWorld(true);
  //     this.instancedMesh.setMatrixAt(instanceId, this.nodeHelper.matrixWorld);
  //   });

  //   this.instancedMesh.instanceMatrix.needsUpdate = true;
  // }

  public updateInstanceMatrices() {
    const nodes = this.quadtree.getActiveNodes();
    const leafNodes = nodes.filter((index) => this.quadtree.isLeafNode(index));

    this.instancedMesh.count = leafNodes.length;

    leafNodes.forEach((nodeIndex, instanceId) => {
      const matrix = this.calculateNodeMatrix(nodeIndex);
      this.instancedMesh.setMatrixAt(instanceId, matrix);
    });

    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }

  private calculateNodeMatrix(nodeIndex: number): THREE.Matrix4 {
    const offset = nodeIndex * NODE_STRIDE;
    const buffer = this.quadtree.nodeBuffer;

    const u = buffer[offset];
    const v = buffer[offset + 1];
    const level = buffer[offset + 2];
    const face = buffer[offset + 3];

    // Calculate position and scale
    const scale = (2 * this.planetRadius) / Math.pow(2, level);
    const position = this.uvToCubePosition(u, v, face as CubeFace);
    const rotation = this.calculateFaceRotation(face as CubeFace);

    // Configure transformation matrix
    this.nodeHelper.position.copy(position);
    this.nodeHelper.scale.set(scale, scale, scale);
    this.nodeHelper.rotation.setFromRotationMatrix(rotation);
    this.nodeHelper.updateMatrixWorld(true);

    return this.nodeHelper.matrixWorld;
  }

  private uvToCubePosition(
    u: number,
    v: number,
    face: CubeFace
  ): THREE.Vector3 {
    const cubeSize = this.planetRadius * 2;
    const pos = new THREE.Vector3();

    switch (face) {
      case 0: // Front (Z+)
        pos.set((u - 0.5) * cubeSize, (v - 0.5) * cubeSize, this.planetRadius);
        break;
      case 1: // Right (X+)
        pos.set(this.planetRadius, (v - 0.5) * cubeSize, (0.5 - u) * cubeSize);
        break;
      case 2: // Back (Z-)
        pos.set((0.5 - u) * cubeSize, (v - 0.5) * cubeSize, -this.planetRadius);
        break;
      case 3: // Left (X-)
        pos.set(-this.planetRadius, (v - 0.5) * cubeSize, (u - 0.5) * cubeSize);
        break;
      case 4: // Top (Y+)
        pos.set((u - 0.5) * cubeSize, this.planetRadius, (v - 0.5) * cubeSize);
        break;
      case 5: // Bottom (Y-)
        pos.set((u - 0.5) * cubeSize, -this.planetRadius, (0.5 - v) * cubeSize);
        break;
    }

    return pos;
  }

  private calculateFaceRotation(face: CubeFace): THREE.Matrix4 {
    const rotation = new THREE.Matrix4();
    const target = new THREE.Vector3();
    const up = new THREE.Vector3();

    switch (face) {
      case 0: // Front
        target.set(0, 0, 1);
        up.set(0, 1, 0);
        break;
      case 1: // Right
        target.set(1, 0, 0);
        up.set(0, 1, 0);
        break;
      case 2: // Back
        target.set(0, 0, -1);
        up.set(0, 1, 0);
        break;
      case 3: // Left
        target.set(-1, 0, 0);
        up.set(0, 1, 0);
        break;
      case 4: // Top
        target.set(0, 1, 0);
        up.set(0, 0, 1);
        break;
      case 5: // Bottom
        target.set(0, -1, 0);
        up.set(0, 0, -1);
        break;
    }

    rotation.lookAt(target, new THREE.Vector3(), up);
    return rotation;
  }

  private calculateOrientation(position: THREE.Vector3): THREE.Vector3 {
    const normal = position.clone().normalize();
    const tangent = new THREE.Vector3()
      .crossVectors(normal, new THREE.Vector3(0, 1, 0))
      .normalize();
    const bitangent = new THREE.Vector3()
      .crossVectors(normal, tangent)
      .normalize();

    return position.clone().add(bitangent);
  }
}
