import * as THREE from "three";
import { CubeNeighborSystem } from "./CubeNeighborSystem";

export type CubeFace = 0 | 1 | 2 | 3 | 4 | 5;
export const NODE_STRIDE = 12; // x, y, level, face + 4 neighbors + 4 children
const tempVec = new THREE.Vector3();

export class PlanetaryQuadtree {
  public readonly nodeBuffer: Float32Array;
  private indexMap = new Map<bigint, number>();
  private freeIndices: number[] = [];
  private currentIndex = 0;
  private faceRoots: number[];
  private activeNodes = new Set<number>();
  private tempView = new Float32Array(12); // Reusable view for node access

  constructor(
    private radius: number,
    public readonly maxLevel: number = 5,
    public readonly bufferSize: number = 1_000_000
  ) {
    this.nodeBuffer = new Float32Array(bufferSize * NODE_STRIDE);
    this.faceRoots = this.initializeFaceRoots();
  }

  public reset() {
    this.currentIndex = 0;
    this.freeIndices = [];
    this.indexMap.clear();
    this.activeNodes.clear();
    this.nodeBuffer.fill(0);
    this.initializeFaceRoots();
  }

  public getActiveNodes(): number[] {
    return Array.from(this.activeNodes);
  }

  public get activeNodeCount(): number {
    return this.activeNodes.size;
  }

  public getMaxNodeCount(): number {
    return this.bufferSize / NODE_STRIDE;
  }

  private initializeFaceRoots(): number[] {
    return Array.from({ length: 6 }, (_, face) => {
      const index = this.addNodeToBuffer(
        0.5,
        0.5,
        0,
        face as CubeFace,
        [-1, -1, -1, -1], // Neighbors not set initially
        [-1, -1, -1, -1] // No children
      );
      return index;
    });
  }

  //   public getLeafNodeCount(): number {
  //     return this.activeNodes.entries.filter((index) => this.isLeafNode(index)).length;
  //   }

  private addNodeToBuffer(
    x: number,
    y: number,
    level: number,
    face: CubeFace,
    neighbors: number[],
    children: number[]
  ): number {
    const index = this.getFreeIndex();
    this.activeNodes.add(index);
    const morton = this.mortonIndex(x, y, level, face);

    this.indexMap.set(morton, index);

    const offset = index * NODE_STRIDE;
    if (offset + NODE_STRIDE > this.nodeBuffer.length) {
      throw new Error(`Node buffer overflow at index ${index}`);
    }
    this.nodeBuffer.set([x, y, level, face], offset);
    this.nodeBuffer.set(neighbors, offset + 4);
    this.nodeBuffer.set(children, offset + 8);

    return index;
  }

  private getFreeIndex(): number {
    if (this.freeIndices.length > 0) {
      return this.freeIndices.pop()!;
    }

    // Check buffer bounds before allocating new index
    if (this.currentIndex >= this.bufferSize) {
      throw new Error(
        `QuadTree node buffer exhausted ${this.currentIndex} >= ${this.bufferSize}`
      );
    }

    return this.currentIndex++;
  }

  public subdivide(nodeIndex: number): void {
    const level = this.nodeBuffer[nodeIndex * NODE_STRIDE + 2];
    if (
      level >= this.maxLevel ||
      this.nodeBuffer[nodeIndex * NODE_STRIDE + 8] !== -1
    )
      return;

    // Create children using direct buffer access
    const children = [
      this.createChildNode(nodeIndex, 0, 0), // NW
      this.createChildNode(nodeIndex, 1, 0), // NE
      this.createChildNode(nodeIndex, 0, 1), // SW
      this.createChildNode(nodeIndex, 1, 1), // SE
    ];

    // Set children references directly in buffer
    this.nodeBuffer.set(children, nodeIndex * NODE_STRIDE + 8);
    this.updateNeighborRelationships(nodeIndex, children);
  }

  private createChildNode(parentIndex: number, dx: number, dy: number): number {
    const offset = parentIndex * NODE_STRIDE;
    const x = this.nodeBuffer[offset] * 0.5 + dx * 0.5;
    const y = this.nodeBuffer[offset + 1] * 0.5 + dy * 0.5;
    const level = this.nodeBuffer[offset + 2] + 1;
    const face = this.nodeBuffer[offset + 3];

    return this.addNodeToBuffer(
      x,
      y,
      level,
      face as CubeFace,
      [-1, -1, -1, -1], // Neighbors
      [-1, -1, -1, -1] // Children
    );
  }

  public isLeafNode(index: number): boolean {
    const offset = index * NODE_STRIDE;
    const hasChildren1 = this.nodeBuffer[offset + 8] > 0; // Child mask

    return !hasChildren1;
  }

  private updateNeighborRelationships(
    parentIndex: number,
    children: number[]
  ): void {
    // Direct buffer access for neighbor relationships
    const [nw, ne, sw, se] = children;

    // Internal neighbors
    this.setNeighbor(nw, 1, ne);
    this.setNeighbor(ne, 3, nw);
    this.setNeighbor(sw, 1, se);
    this.setNeighbor(se, 3, sw);
    this.setNeighbor(nw, 2, sw);
    this.setNeighbor(sw, 0, nw);
    this.setNeighbor(ne, 2, se);
    this.setNeighbor(se, 0, ne);

    // External neighbors using parent's face
    const parentFace = this.nodeBuffer[parentIndex * NODE_STRIDE + 3];
    children.forEach((child) =>
      this.resolveExternalNeighbors(child, parentFace as CubeFace)
    );
  }

  private setNeighbor(
    nodeIndex: number,
    direction: number,
    neighborIndex: number
  ): void {
    const neighborOffset = nodeIndex * NODE_STRIDE + 4 + direction;
    this.nodeBuffer[neighborOffset] = neighborIndex;
  }

  public getNodeAt(worldPosition: THREE.Vector3): number | null {
    const { face, uv } = this.worldToFaceUV(worldPosition);
    return this.findNodeInFace(face, uv.x, uv.y);
  }

  private worldToFaceUV(position: THREE.Vector3): {
    face: CubeFace;
    uv: THREE.Vector2;
  } {
    const dir = position.clone().normalize();
    const absX = Math.abs(dir.x);
    const absY = Math.abs(dir.y);
    const absZ = Math.abs(dir.z);

    let face: CubeFace;
    let u: number, v: number;

    if (absX >= absY && absX >= absZ) {
      // X-axis dominant
      face = dir.x > 0 ? 1 : 3;
      const inv = 1 / absX;
      u = dir.z * inv * (dir.x > 0 ? -1 : 1);
      v = dir.y * inv;
    } else if (absY >= absZ) {
      // Y-axis dominant
      face = dir.y > 0 ? 4 : 5;
      const inv = 1 / absY;
      u = dir.x * inv;
      v = dir.z * inv * (dir.y > 0 ? 1 : -1);
    } else {
      // Z-axis dominant
      face = dir.z > 0 ? 0 : 2;
      const inv = 1 / absZ;
      u = dir.x * inv * (dir.z > 0 ? 1 : -1);
      v = dir.y * inv;
    }

    // Convert to [0,1] range with safety margin
    u = THREE.MathUtils.clamp((u + 1) * 0.5, 1e-6, 1 - 1e-6);
    v = THREE.MathUtils.clamp((v + 1) * 0.5, 1e-6, 1 - 1e-6);

    return {
      face: face,
      uv: new THREE.Vector2(u, v),
    };
  }

  private findNodeInFace(face: CubeFace, x: number, y: number): number | null {
    let currentIndex = this.faceRoots[face];
    let level = 0;

    while (true) {
      const offset = currentIndex * NODE_STRIDE;
      const nodeLevel = this.nodeBuffer[offset + 2];

      if (nodeLevel === this.maxLevel || this.nodeBuffer[offset + 8] === -1) {
        return currentIndex;
      }

      const childIndex = (x >= 0.5 ? 1 : 0) + (y >= 0.5 ? 2 : 0);
      currentIndex = this.nodeBuffer[offset + 8 + childIndex];

      x = (x - (childIndex % 2) * 0.5) * 2;
      y = (y - Math.floor(childIndex / 2) * 0.5) * 2;
      level++;
    }
  }

  public updateLOD(cameraPosition: THREE.Vector3): void {
    // this.reset();
    this.faceRoots.forEach((root) => this.updateNodeLOD(root, cameraPosition));
  }

  private updateNodeLOD(nodeIndex: number, cameraPos: THREE.Vector3): void {
    const offset = nodeIndex * NODE_STRIDE;
    const level = this.nodeBuffer[offset + 2];
    const worldPos = this.getWorldPosition(offset);
    const distance = cameraPos.distanceTo(worldPos);
    const size = this.radius * Math.sin(Math.PI / 4) * 2;
    const lodThreshold = 1.75;

    if (distance < size * lodThreshold && level < this.maxLevel) {
      if (this.nodeBuffer[offset + 8] === -1) this.subdivide(nodeIndex);
      for (let i = 0; i < 4; i++) {
        //  update children
        this.updateNodeLOD(this.nodeBuffer[offset + 8 + i], cameraPos);
      }
    } else {
      if (this.nodeBuffer[offset + 8] !== -1) this.merge(nodeIndex);
    }
  }

  private merge(nodeIndex: number): void {
    const offset = nodeIndex * NODE_STRIDE;
    const children = [
      this.nodeBuffer[offset + 8],
      this.nodeBuffer[offset + 9],
      this.nodeBuffer[offset + 10],
      this.nodeBuffer[offset + 11],
    ];

    // Early exit if no children
    if (children[0] === -1) return;

    // Process each child
    children.forEach((childIndex) => {
      if (childIndex === -1) return;

      const childOffset = childIndex * NODE_STRIDE;

      // 1. Update neighbors to point to parent instead of child
      for (let dir = 0; dir < 4; dir++) {
        const neighborIndex = this.nodeBuffer[childOffset + 4 + dir];
        if (neighborIndex === -1) continue;

        const neighborOffset = neighborIndex * NODE_STRIDE;
        for (let neighborDir = 0; neighborDir < 4; neighborDir++) {
          if (
            this.nodeBuffer[neighborOffset + 4 + neighborDir] === childIndex
          ) {
            this.nodeBuffer[neighborOffset + 4 + neighborDir] = nodeIndex;
          }
        }
      }

      // 2. Recursively merge grandchildren first
      if (this.nodeBuffer[childOffset + 8] !== -1) {
        this.merge(childIndex);
      }

      // 3. Free the child index
      this.freeIndices.push(childIndex);

      // 4. Remove from spatial index
      const x = this.nodeBuffer[childOffset];
      const y = this.nodeBuffer[childOffset + 1];
      const level = this.nodeBuffer[childOffset + 2];
      const face = this.nodeBuffer[childOffset + 3];
      this.indexMap.delete(this.mortonIndex(x, y, level, face as CubeFace));
      this.activeNodes.delete(childIndex);
    });

    // 5. Clear parent's children references
    this.nodeBuffer.set([-1, -1, -1, -1], offset + 8);

    // 6. Update parent's neighbors if needed
    for (let dir = 0; dir < 4; dir++) {
      if (this.nodeBuffer[offset + 4 + dir] === -1) {
        this.resolveExternalNeighbors(
          nodeIndex,
          this.nodeBuffer[offset + 3] as CubeFace
        );
      }
    }
  }

  private getWorldPosition(offset: number): THREE.Vector3 {
    // Reuse a single vector for position calculations
    const face = this.nodeBuffer[offset + 3];
    const x = this.nodeBuffer[offset];
    const y = this.nodeBuffer[offset + 1];

    // Convert face UV to world position
    return tempVec.setFromSphericalCoords(
      this.radius,
      Math.PI / 2 - ((face % 2) * Math.PI) / 2 + (y * Math.PI) / 2,
      (Math.floor(face / 2) * Math.PI) / 2 + (x * Math.PI) / 2
    );
  }

  private mortonIndex(
    x: number,
    y: number,
    level: number,
    face: CubeFace
  ): bigint {
    const scale = 0xffffffff >>> (32 - level);
    return BigInt(
      (face << 59) |
        (Math.floor(x * scale) << 31) |
        (Math.floor(y * scale) << 3) |
        (level & 0x1f)
    );
  }

  private resolveExternalNeighbors(
    nodeIndex: number,
    parentFace: CubeFace
  ): void {
    const offset = nodeIndex * NODE_STRIDE;
    const x = this.nodeBuffer[offset];
    const y = this.nodeBuffer[offset + 1];
    const level = this.nodeBuffer[offset + 2];

    for (let dir = 0; dir < 4; dir++) {
      if (this.nodeBuffer[offset + 4 + dir] === -1) {
        // Use parentFace for neighbor resolution
        const neighborIndex = this.findNeighborAcrossFaces(
          x,
          y,
          level,
          parentFace,
          dir
        );

        if (neighborIndex !== -1) {
          this.nodeBuffer[offset + 4 + dir] = neighborIndex;
          // Update reciprocal neighbor using child's actual face
          const reciprocalDir = (dir + 2) % 4;
          const neighborOffset = neighborIndex * NODE_STRIDE;
          this.nodeBuffer[neighborOffset + 4 + reciprocalDir] = nodeIndex;
        }
      }
    }
  }

  private findNeighborAcrossFaces(
    x: number,
    y: number,
    level: number,
    parentFace: CubeFace, // Now using parent face
    direction: number
  ): number {
    const neighbor = CubeNeighborSystem.findNeighborAcrossFaces(
      x,
      y,
      level,
      parentFace,
      direction
    );
    if (!neighbor) return -1;

    // Search using the neighbor's actual face
    const morton = this.mortonIndex(
      neighbor.x,
      neighbor.y,
      level,
      neighbor.face
    );
    return this.indexMap.get(morton) ?? -1;
  }
}

// interface NodeData {
//   u;
//   v;
//   level;
//   face;
//   neighbors 1 - 4
//   children 1 - 4
// }
