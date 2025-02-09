import * as THREE from "three";

export type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type NeighborIndices = [number, number, number, number]; // [left, right, top, bottom]
export type ChildIndices = [number, number, number, number]; // [left, right, top, bottom]
export type EdgeInfo = { face: FaceIndex; rotation: number };
export type SpherePos = [number, number, number];

export interface CubeSphereNode {
  face: FaceIndex;
  level: number;
  x: number;
  y: number;
  children: ChildIndices; // indices of child nodes
  neighbors: NeighborIndices;
  spherePos: SpherePos;
  errorMetric: number;
}

const NODE_STRIDE = 64; // 64 bytes per node (16 elements)
const MAX_NODES = 1_000_000; // Pre-allocated buffer size

export class CubeSphereQuadtree {
  private nodeBuffer: Float32Array;
  private indexMap: Map<string, number>;
  private faceAdjacency: Map<FaceIndex, Map<string, EdgeInfo>>;
  private nextIndex = 0;
  private freeIndices: number[] = [];
  public maxDepth = 8; // Configurable depth limit

  constructor() {
    this.nodeBuffer = new Float32Array(MAX_NODES * NODE_STRIDE);
    this.indexMap = new Map();
    this.faceAdjacency = new Map();
    this.initFaceAdjacency();
    this.createRootNodes();
  }

  private initFaceAdjacency() {
    type EdgeInfo = { face: FaceIndex; rotation: number };
    const faceMap = new Map<FaceIndex, Map<string, EdgeInfo>>();

    // Front face (+X)
    faceMap.set(
      0,
      new Map([
        ["left", { face: 3, rotation: 0 }],
        ["right", { face: 2, rotation: 0 }],
        ["top", { face: 4, rotation: 1 }],
        ["bottom", { face: 5, rotation: 3 }],
      ])
    );

    // Back face (-X)
    faceMap.set(
      1,
      new Map([
        ["left", { face: 2, rotation: 0 }],
        ["right", { face: 3, rotation: 0 }],
        ["top", { face: 4, rotation: 3 }],
        ["bottom", { face: 5, rotation: 1 }],
      ])
    );

    // Right face (+Y)
    faceMap.set(
      2,
      new Map([
        ["left", { face: 0, rotation: 0 }],
        ["right", { face: 1, rotation: 0 }],
        ["top", { face: 4, rotation: 2 }],
        ["bottom", { face: 5, rotation: 0 }],
      ])
    );

    // Left face (-Y)
    faceMap.set(
      3,
      new Map([
        ["left", { face: 1, rotation: 0 }],
        ["right", { face: 0, rotation: 0 }],
        ["top", { face: 4, rotation: 0 }],
        ["bottom", { face: 5, rotation: 2 }],
      ])
    );

    // Top face (+Z)
    faceMap.set(
      4,
      new Map([
        ["left", { face: 3, rotation: 3 }],
        ["right", { face: 2, rotation: 1 }],
        ["top", { face: 1, rotation: 2 }],
        ["bottom", { face: 0, rotation: 2 }],
      ])
    );

    // Bottom face (-Z)
    faceMap.set(
      5,
      new Map([
        ["left", { face: 3, rotation: 1 }],
        ["right", { face: 2, rotation: 3 }],
        ["top", { face: 0, rotation: 0 }],
        ["bottom", { face: 1, rotation: 0 }],
      ])
    );

    this.faceAdjacency = faceMap;
  }

  private createRootNodes() {
    // Initialize 6 root nodes with proper coordinates
    for (let face = 0; face < 6; face++) {
      this.createNode(face as FaceIndex, 0, 0, 0);
    }
  }

  private createNode(
    face: FaceIndex,
    level: number,
    x: number,
    y: number
  ): number {
    const index = this.findFreeIndex();
    const offset = index * (NODE_STRIDE / 4); // Convert to element index

    // Store core properties (8 elements)
    this.nodeBuffer.set([face, level, x, y, -1, -1, -1, -1], offset);

    // Calculate sphere position
    const spherePos = this.cubeToSphere(face, x, y, level);
    this.nodeBuffer.set(spherePos, offset + 8);

    // Initialize neighbors and error metric (elements 11-15)
    this.nodeBuffer.set([-1, -1, -1, -1], offset + 11);
    this.nodeBuffer[offset + 15] = 0; // errorMetric

    // Store in index map
    const key = `${face}:${level}:${x}:${y}`;
    this.indexMap.set(key, index);

    return index;
  }

  private cubeToSphere(
    face: FaceIndex,
    x: number,
    y: number,
    level: number
  ): Float32Array {
    const scale = Math.pow(0.5, level);
    // Calculate UV coordinates in [-1, 1] range
    const u = (x + 0.5) * scale * 2 - 1;
    const v = (y + 0.5) * scale * 2 - 1;

    let vec = new Float32Array(3);
    switch (face) {
      case 0: // +X face (front)
        vec.set([1, v, -u]);
        break;
      case 1: // -X face (back)
        vec.set([-1, v, u]);
        break;
      case 2: // +Y face (right)
        vec.set([u, 1, -v]);
        break;
      case 3: // -Y face (left)
        vec.set([-u, -1, -v]);
        break;
      case 4: // +Z face (top)
        vec.set([u, -v, 1]);
        break;
      case 5: // -Z face (bottom)
        vec.set([u, v, -1]);
        break;
    }

    // Normalize to unit sphere
    const length = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2);
    // Handle special case for root nodes to avoid negative zeros
    if (level === 0 && x === 0 && y === 0) {
      return new Float32Array(vec.map((n) => Math.abs(n / length) || 0));
    }
    return new Float32Array(vec.map((n) => n / length));
  }

  private splitNode(nodeIndex: number) {
    const node = this.getNodeView(nodeIndex);
    if (node.children[0] !== -1) return; // Already split

    // Create 4 child nodes
    const children = Array.from({ length: 4 }, (_, i) =>
      this.createNode(
        node.face,
        node.level + 1,
        node.x * 2 + (i % 2),
        node.y * 2 + Math.floor(i / 2)
      )
    );

    // Update parent node's children references (fixed offset calculation)
    const elementOffset = nodeIndex * (NODE_STRIDE / 4) + 4;
    this.nodeBuffer.set(children, elementOffset);

    // Update child neighbors
    this.updateChildNeighbors(nodeIndex, children);
  }

  private updateChildNeighbors(parentIndex: number, children: number[]) {
    // Complex neighbor resolution including cross-face neighbors
    const parent = this.getNodeView(parentIndex);
    const childLevel = parent.level + 1;

    children.forEach((childIndex, i) => {
      const child = this.getNodeView(childIndex);
      const neighbors = this.calculateNeighbors(child);
      const childOffset = childIndex * (NODE_STRIDE / 4);
      this.nodeBuffer.set(neighbors, childOffset + 11); // Store at elements 11-14
    });
  }

  private calculateNeighbors(node: NodeView): NeighborIndices {
    // Handle same-face and cross-face neighbors
    return [
      this.getNeighborIndex(node, "left"),
      this.getNeighborIndex(node, "right"),
      this.getNeighborIndex(node, "top"),
      this.getNeighborIndex(node, "bottom"),
    ];
  }

  private getNeighborIndex(
    node: NodeView,
    direction: "left" | "right" | "top" | "bottom"
  ): number {
    // Check if neighbor is on same face
    const [nx, ny, nface] = this.getNeighborCoordinates(node, direction);

    if (nface === node.face) {
      // Same face neighbor
      const key = `${nface}:${node.level}:${nx}:${ny}`;
      return this.indexMap.get(key) ?? -1;
    } else {
      // Cross-face neighbor - requires adjacency resolution
      return this.resolveCrossFaceNeighbor(node, direction);
    }
  }

  private resolveCrossFaceNeighbor(node: NodeView, direction: string): number {
    const edgeInfo = this.faceAdjacency.get(node.face)?.get(direction);
    if (!edgeInfo) return -1;

    const [rotatedX, rotatedY] = this.rotateCoordinates(
      node.x,
      node.y,
      node.level,
      edgeInfo.rotation
    );

    // Ensure neighbor exists at target position
    return this.findOrCreateNeighbor(
      edgeInfo.face,
      node.level,
      rotatedX,
      rotatedY
    );
  }

  private findOrCreateNeighbor(
    face: FaceIndex,
    level: number,
    x: number,
    y: number
  ): number {
    let currentFace = face;
    let currentLevel = level;
    let currentX = x;
    let currentY = y;

    while (currentLevel >= 0) {
      const key = this.generateAdjacentKey(
        currentFace,
        currentLevel,
        currentX,
        currentY
      );
      const index = this.indexMap.get(key);

      if (index !== undefined) {
        return this.ensureSplitToLevel(index, level - currentLevel);
      }

      // Move up one level
      currentLevel--;
      currentX = Math.floor(currentX / 2);
      currentY = Math.floor(currentY / 2);
    }

    return -1;
  }

  private ensureSplitToLevel(nodeIndex: number, depth: number): number {
    if (depth <= 0) return nodeIndex;

    let currentIndex = nodeIndex;
    for (let i = 0; i < depth; i++) {
      const node = this.getNodeView(currentIndex);
      if (node.children[0] === -1) {
        this.splitNode(currentIndex);
      }
      // Get the first child index directly from the parent's children array
      currentIndex = node.children[0];
      if (currentIndex === -1) break;
    }
    return currentIndex;
  }

  private findFreeIndex(): number {
    // Check for recycled indices first
    if (this.freeIndices.length > 0) {
      return this.freeIndices.pop()!;
    }

    // Fall back to linear allocation
    const newIndex = this.nextIndex++;
    if (newIndex >= MAX_NODES) {
      throw new Error("CubeSphereQuadtree node buffer overflow");
    }
    return newIndex;
  }

  public getNodeView(nodeIndex: number): NodeView {
    return new NodeView(this.nodeBuffer, nodeIndex);
  }

  private getNeighborCoordinates(
    node: NodeView,
    direction: "left" | "right" | "top" | "bottom"
  ): [number, number, FaceIndex] {
    const maxCoord = (1 << node.level) - 1;
    let nx = node.x;
    let ny = node.y;
    let nface = node.face;

    switch (direction) {
      case "left":
        if (nx > 0) return [nx - 1, ny, node.face];
        nface =
          this.faceAdjacency.get(node.face)?.get("left")?.face ?? node.face;
        nx = maxCoord;
        break;
      case "right":
        if (nx < maxCoord) return [nx + 1, ny, node.face];
        nface =
          this.faceAdjacency.get(node.face)?.get("right")?.face ?? node.face;
        nx = 0;
        break;
      case "top":
        if (ny < maxCoord) return [nx, ny + 1, node.face];
        nface =
          this.faceAdjacency.get(node.face)?.get("top")?.face ?? node.face;
        ny = 0;
        break;
      case "bottom":
        if (ny > 0) return [nx, ny - 1, node.face];
        nface =
          this.faceAdjacency.get(node.face)?.get("bottom")?.face ?? node.face;
        ny = maxCoord;
        break;
    }

    return [nx, ny, nface];
  }

  private rotateCoordinates(
    x: number,
    y: number,
    level: number,
    rotation: number
  ): [number, number] {
    const maxCoord = (1 << level) - 1;

    // Apply rotation transforms
    switch (rotation) {
      case 1: // 90° counter-clockwise
        return [y, maxCoord - x];
      case 2: // 180°
        return [maxCoord - x, maxCoord - y];
      case 3: // 270° counter-clockwise (90° clockwise)
        return [maxCoord - y, x];
      default: // 0°
        return [x, y];
    }
  }

  private generateAdjacentKey(
    face: FaceIndex,
    level: number,
    x: number,
    y: number
  ): string {
    return `${face}:${level}:${x}:${y}`;
  }

  private retireNode(nodeIndex: number) {
    const node = this.getNodeView(nodeIndex);

    // Only process valid nodes
    if (node.level === -1) return;

    // Clear children first
    node.children.forEach((child) => {
      if (child !== -1) this.retireNode(child);
    });

    // Mark as free
    this.freeIndices.push(nodeIndex);
    this.indexMap.delete(`${node.face}:${node.level}:${node.x}:${node.y}`);

    // Reset node data
    const offset = nodeIndex * (NODE_STRIDE / 4);
    this.nodeBuffer.fill(-1, offset, offset + 16);
  }

  public updateLOD(cameraPos: THREE.Vector3, maxDepth: number = this.maxDepth) {
    this.maxDepth = maxDepth;
    const threshold = this.calculateLODThreshold(cameraPos);

    // Process all root nodes
    for (let face = 0; face < 6; face++) {
      const rootIndex = this.indexMap.get(`${face}:0:0:0`);
      if (rootIndex !== undefined) {
        this.updateNodeLOD(rootIndex, cameraPos, maxDepth, threshold);
      }
    }
  }

  private updateNodeLOD(
    nodeIndex: number,
    cameraPos: THREE.Vector3,
    maxDepth: number,
    threshold: number
  ) {
    const node = this.getNodeView(nodeIndex);
    const distance = cameraPos.distanceTo(new THREE.Vector3(...node.spherePos));
    const lodMetric = (node.errorMetric || 1 / (1 << node.level)) / distance;

    if (lodMetric > threshold && node.level < maxDepth) {
      this.splitNode(nodeIndex);
      node.children.forEach((child) => {
        if (child !== -1)
          this.updateNodeLOD(child, cameraPos, maxDepth, threshold);
      });
    } else {
      // Only retire children, not the node itself
      node.children.forEach((child) => {
        if (child !== -1) this.retireNode(child);
      });
      this.nodeBuffer.set([-1, -1, -1, -1], nodeIndex * NODE_STRIDE + 4);
    }
  }

  private calculateLODThreshold(cameraPos: THREE.Vector3): number {
    // Base threshold on camera height
    const height = cameraPos.length();
    return Math.min(0.1, 0.01 * height);
  }

  public getVisibleNodes(): number[] {
    const visibleNodes: number[] = [];

    // Iterate through all active nodes
    this.indexMap.forEach((index) => {
      const node = this.getNodeView(index);

      // Check if node is a leaf node (no children)
      if (node.children[0] === -1) {
        visibleNodes.push(index);
      }
    });

    return visibleNodes;
  }

  private getChildIndex(childX: number, childY: number): number {
    // Determine quadrant (0=bottom-left, 1=bottom-right, 2=top-left, 3=top-right)
    return (childX % 2) + (childY % 2) * 2;
  }
}

// Helper class for buffer access
class NodeView {
  constructor(private buffer: Float32Array, private index: number) {}

  get face() {
    return this.buffer[this.index * (NODE_STRIDE / 4)];
  }
  get level() {
    return this.buffer[this.index * (NODE_STRIDE / 4) + 1];
  }
  get x() {
    return this.buffer[this.index * (NODE_STRIDE / 4) + 2];
  }
  get y() {
    return this.buffer[this.index * (NODE_STRIDE / 4) + 3];
  }
  get children() {
    return Array.from(
      this.buffer.subarray(
        this.index * (NODE_STRIDE / 4) + 4,
        this.index * (NODE_STRIDE / 4) + 8
      )
    ) as ChildIndices;
  }
  get neighbors() {
    return Array.from(
      this.buffer.subarray(
        this.index * (NODE_STRIDE / 4) + 11,
        this.index * (NODE_STRIDE / 4) + 15
      )
    ) as NeighborIndices;
  }
  get spherePos() {
    return [
      this.buffer[this.index * (NODE_STRIDE / 4) + 8],
      this.buffer[this.index * (NODE_STRIDE / 4) + 9],
      this.buffer[this.index * (NODE_STRIDE / 4) + 10],
    ] as SpherePos;
  }
  get errorMetric() {
    return this.buffer[this.index * NODE_STRIDE + 16];
  }

  set(buffer: Float32Array, index: number) {
    this.buffer = buffer;
    this.index = index;
  }

  toObject() {
    return {
      face: this.face,
      level: this.level,
      x: this.x,
      y: this.y,
      children: this.children,
      neighbors: this.neighbors,
      spherePos: this.spherePos,
      errorMetric: this.errorMetric,
    };
  }
}
