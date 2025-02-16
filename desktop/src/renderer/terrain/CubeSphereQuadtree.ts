import * as THREE from "three";
import {
  CubeFace,
  CubicCoordinates,
} from "../../lib/coordinate-systems/CubeProjection/CubicCoordinates";

export type NeighborIndices = [number, number, number, number]; // [left, right, top, bottom]
export type ChildIndices = [number, number, number, number]; // [left, right, top, bottom]
export type EdgeInfo = { face: CubeFace; rotation: number };
export type SpherePos = [number, number, number];

export interface CubeSphereNode {
  face: CubeFace;
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
const tempVector = new THREE.Vector3();
const origin = new THREE.Vector3();

export class CubeSphereQuadtree {
  private nodeBuffer: Float32Array;
  private indexMap: Map<number, number>;
  private faceAdjacency: Map<CubeFace, Map<string, EdgeInfo>>;
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
    const faceMap = new Map<CubeFace, Map<string, EdgeInfo>>();

    // Update face mappings to use CubeFace enum
    faceMap.set(
      CubeFace.POSITIVE_Z,
      new Map([
        ["left", { face: CubeFace.NEGATIVE_X, rotation: 0 }],
        ["right", { face: CubeFace.POSITIVE_X, rotation: 0 }],
        ["top", { face: CubeFace.POSITIVE_Y, rotation: 1 }],
        ["bottom", { face: CubeFace.NEGATIVE_Y, rotation: 3 }],
      ])
    );

    faceMap.set(
      CubeFace.NEGATIVE_Z,
      new Map([
        ["left", { face: CubeFace.POSITIVE_X, rotation: 0 }],
        ["right", { face: CubeFace.NEGATIVE_X, rotation: 0 }],
        ["top", { face: CubeFace.POSITIVE_Y, rotation: 3 }],
        ["bottom", { face: CubeFace.NEGATIVE_Y, rotation: 1 }],
      ])
    );

    faceMap.set(
      CubeFace.POSITIVE_X,
      new Map([
        ["left", { face: CubeFace.NEGATIVE_Z, rotation: 0 }],
        ["right", { face: CubeFace.POSITIVE_Z, rotation: 0 }],
        ["top", { face: CubeFace.POSITIVE_Y, rotation: 2 }],
        ["bottom", { face: CubeFace.NEGATIVE_Y, rotation: 0 }],
      ])
    );

    faceMap.set(
      CubeFace.NEGATIVE_X,
      new Map([
        ["left", { face: CubeFace.POSITIVE_Z, rotation: 0 }],
        ["right", { face: CubeFace.NEGATIVE_Z, rotation: 0 }],
        ["top", { face: CubeFace.POSITIVE_Y, rotation: 0 }],
        ["bottom", { face: CubeFace.NEGATIVE_Y, rotation: 2 }],
      ])
    );

    faceMap.set(
      CubeFace.POSITIVE_Y,
      new Map([
        ["left", { face: CubeFace.NEGATIVE_X, rotation: 3 }],
        ["right", { face: CubeFace.POSITIVE_X, rotation: 1 }],
        ["top", { face: CubeFace.NEGATIVE_Z, rotation: 2 }],
        ["bottom", { face: CubeFace.POSITIVE_Z, rotation: 2 }],
      ])
    );

    faceMap.set(
      CubeFace.NEGATIVE_Y,
      new Map([
        ["left", { face: CubeFace.NEGATIVE_X, rotation: 1 }],
        ["right", { face: CubeFace.POSITIVE_X, rotation: 3 }],
        ["top", { face: CubeFace.POSITIVE_Z, rotation: 0 }],
        ["bottom", { face: CubeFace.NEGATIVE_Z, rotation: 0 }],
      ])
    );

    this.faceAdjacency = faceMap;
  }

  private createRootNodes() {
    // Initialize 6 root nodes with proper coordinates
    const rootIndices = new Map<CubeFace, number>();

    // First create all root nodes
    for (let face = 0; face < 6; face++) {
      const index = this.createNode(face as CubeFace, 0, 0, 0);
      rootIndices.set(face as CubeFace, index);
    }

    // Now set up neighbor relationships
    for (const [face, index] of rootIndices) {
      const neighbors: NeighborIndices = [
        rootIndices.get(this.faceAdjacency.get(face)?.get("left")?.face!)!,
        rootIndices.get(this.faceAdjacency.get(face)?.get("right")?.face!)!,
        rootIndices.get(this.faceAdjacency.get(face)?.get("top")?.face!)!,
        rootIndices.get(this.faceAdjacency.get(face)?.get("bottom")?.face!)!,
      ];

      const offset = index * (NODE_STRIDE / 4) + 11; // Neighbors start at index 11
      this.nodeBuffer.set(neighbors, offset);
    }
  }

  private createNode(
    face: CubeFace,
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
    const key = this.getNodeHash(face, level, x, y);
    this.indexMap.set(key, index);

    return index;
  }

  private cubeToSphere(
    face: CubeFace,
    x: number,
    y: number,
    level: number
  ): Float32Array {
    const scale = 1 << level;
    const u = (x + 0.5) / scale;
    const v = (y + 0.5) / scale;
    return CubicCoordinates.fromUV(face, u, v)
      .toVector3()
      .normalize()
      .toArray();
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
      // Same face neighbor - find existing ancestor
      return this.findExistingAncestor(nface, node.level, nx, ny);
    } else {
      // Cross-face neighbor - requires adjacency resolution
      return this.resolveCrossFaceNeighbor(node, direction);
    }
  }

  private findExistingAncestor(
    face: CubeFace,
    targetLevel: number,
    targetX: number,
    targetY: number
  ): number {
    let currentLevel = targetLevel;
    let currentX = targetX;
    let currentY = targetY;

    while (currentLevel >= 0) {
      const key = this.getNodeHash(face, currentLevel, currentX, currentY);
      const index = this.indexMap.get(key);
      if (index !== undefined) {
        return index;
      }
      // Move up to parent level
      currentLevel--;
      currentX = Math.floor(currentX / 2);
      currentY = Math.floor(currentY / 2);
    }
    return -1; // Shouldn't happen as root nodes exist
  }

  private resolveCrossFaceNeighbor(node: NodeView, direction: string): number {
    const edgeInfo = this.faceAdjacency.get(node.face)?.get(direction);
    if (!edgeInfo) return -1;

    const [rotatedX, rotatedY] = this.rotateCoordinates(
      node.x,
      node.y,
      node.level,
      edgeInfo.rotation,
      direction
    );

    // Calculate the actual coordinates based on edge position
    const maxCoord = (1 << node.level) - 1;
    const actualX =
      direction === "left" ? maxCoord : direction === "right" ? 0 : rotatedX;
    const actualY =
      direction === "bottom" ? maxCoord : direction === "top" ? 0 : rotatedY;

    const key = this.getNodeHash(edgeInfo.face, node.level, actualX, actualY);
    return this.indexMap.get(key) ?? -1;
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
  ): [number, number, CubeFace] {
    const maxCoord = (1 << node.level) - 1;
    let nx = node.x;
    let ny = node.y;
    let nface = node.face;

    switch (direction) {
      case "left":
        if (nx > 0) return [nx - 1, ny, node.face];
        nface = (this.faceAdjacency.get(node.face)?.get("left")?.face ??
          node.face) as CubeFace;
        nx = maxCoord;
        break;
      case "right":
        if (nx < maxCoord) return [nx + 1, ny, node.face];
        nface = (this.faceAdjacency.get(node.face)?.get("right")?.face ??
          node.face) as CubeFace;
        nx = 0;
        break;
      case "top":
        if (ny < maxCoord) return [nx, ny + 1, node.face];
        nface = (this.faceAdjacency.get(node.face)?.get("top")?.face ??
          node.face) as CubeFace;
        ny = 0;
        break;
      case "bottom":
        if (ny > 0) return [nx, ny - 1, node.face];
        nface = (this.faceAdjacency.get(node.face)?.get("bottom")?.face ??
          node.face) as CubeFace;
        ny = maxCoord;
        break;
    }

    return [nx, ny, nface as CubeFace];
  }

  private rotateCoordinates(
    x: number,
    y: number,
    level: number,
    rotation: number,
    edgeDirection?: string
  ): [number, number] {
    const maxCoord = (1 << level) - 1;
    let rotatedX = x;
    let rotatedY = y;

    // Apply rotation transformation
    switch (rotation % 4) {
      case 1: // 90 degrees
        [rotatedX, rotatedY] = [maxCoord - y, x];
        break;
      case 2: // 180 degrees
        [rotatedX, rotatedY] = [maxCoord - x, maxCoord - y];
        break;
      case 3: // 270 degrees
        [rotatedX, rotatedY] = [y, maxCoord - x];
        break;
    }

    // Adjust coordinates based on edge direction
    if (edgeDirection) {
      switch (edgeDirection) {
        case "left":
          return [maxCoord, rotatedY];
        case "right":
          return [0, rotatedY];
        case "top":
          return [rotatedX, 0];
        case "bottom":
          return [rotatedX, maxCoord];
      }
    }
    return [rotatedX, rotatedY];
  }

  private retireNode(nodeIndex: number) {
    const stack: number[] = [nodeIndex];

    while (stack.length > 0) {
      const currentIndex = stack.pop()!;
      const node = this.getNodeView(currentIndex);

      // Skip already retired nodes
      if (node.level === -1) continue;

      // Collect children first
      const children = node.children.filter((c) => c !== -1);

      // Mark as free before clearing children
      this.freeIndices.push(currentIndex);
      this.indexMap.delete(
        this.getNodeHash(node.face, node.level, node.x, node.y)
      );

      // Clear node data
      const offset = currentIndex * (NODE_STRIDE / 4);
      this.nodeBuffer.fill(-1, offset, offset + 16);

      // Push children to stack (process them next)
      stack.push(...children);
    }
  }

  public updateLOD(
    cameraPos: THREE.Vector3,
    radius: number = 1,
    offset: THREE.Vector3 = origin,
    maxDepth: number = this.maxDepth
  ) {
    this.maxDepth = maxDepth;
    const threshold = this.calculateLODThreshold(cameraPos);

    // Process all root nodes
    for (let face = 0; face < 6; face++) {
      const rootIndex = this.indexMap.get(this.getNodeHash(face, 0, 0, 0));
      if (rootIndex !== undefined) {
        this.updateNodeLOD(
          rootIndex,
          cameraPos,
          radius,
          offset,
          maxDepth,
          threshold
        );
      }
    }
  }

  private updateNodeLOD(
    nodeIndex: number,
    cameraPos: THREE.Vector3,
    radius: number,
    offset: THREE.Vector3,
    maxDepth: number,
    threshold: number
  ) {
    const node = this.getNodeView(nodeIndex);

    // Calculate distance to camera
    tempVector.set(node.spherePos[0], node.spherePos[1], node.spherePos[2]);
    tempVector.multiplyScalar(radius);
    tempVector.add(offset);
    const distance = cameraPos.distanceTo(tempVector);

    // Calculate node size in world space
    const nodeSize = (radius * 2) / (1 << node.level);

    // Split condition: close enough and not at max depth
    if (distance < nodeSize * 2 && node.level < maxDepth) {
      // Split if not already split
      if (node.children[0] === -1) {
        this.splitNode(nodeIndex);
      }

      // Update children
      node.children.forEach((child) => {
        if (child !== -1) {
          this.updateNodeLOD(
            child,
            cameraPos,
            radius,
            offset,
            maxDepth,
            threshold
          );
        }
      });
    } else {
      // Merge condition: too far or at max depth
      if (node.children[0] !== -1) {
        // Retire all children recursively
        node.children.forEach((child) => {
          if (child !== -1) {
            this.retireNode(child);
          }
        });
        // Clear children references
        const offset = nodeIndex * (NODE_STRIDE / 4) + 4;
        this.nodeBuffer.set([-1, -1, -1, -1], offset);
      }
    }
  }

  private calculateLODThreshold(cameraPos: THREE.Vector3): number {
    // Base threshold on camera distance
    return 0.1 * cameraPos.length();
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

  public findNodeAtPosition(
    worldPos: THREE.Vector3,
    radius: number,
    offset: THREE.Vector3,
    onlyLeafNodes: boolean = true
  ): number | null {
    const direction = new THREE.Vector3()
      .subVectors(worldPos, offset)
      .normalize();
    const coords = CubicCoordinates.fromDirection(direction);

    // Search through visible nodes on this face
    let closestNode: number | null = null;
    let closestDistance = Infinity;

    this.indexMap.forEach((index) => {
      const node = this.getNodeView(index);
      if (node.face !== coords.face) return;

      // Calculate node bounds in face coordinates
      const scale = 1 << node.level;
      const minX = (node.x / scale) * 2 - 1;
      const maxX = ((node.x + 1) / scale) * 2 - 1;
      const minY = (node.y / scale) * 2 - 1;
      const maxY = ((node.y + 1) / scale) * 2 - 1;

      if (
        coords.u >= minX &&
        coords.u <= maxX &&
        coords.v >= minY &&
        coords.v <= maxY
      ) {
        const distance = Math.hypot(
          coords.u - (minX + maxX) / 2,
          coords.v - (minY + maxY) / 2
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestNode = index;
        }
      }
    });

    // Drill down to leaf node if requested
    if (onlyLeafNodes && closestNode !== null) {
      let currentNode = this.getNodeView(closestNode);
      while (currentNode.children[0] !== -1) {
        const childScale = 1 << (currentNode.level + 1);
        const childX =
          Math.floor((coords.u + 1) * 0.5 * childScale) % childScale;
        const childY =
          Math.floor((coords.v + 1) * 0.5 * childScale) % childScale;

        const childKey = this.getNodeHash(
          coords.face,
          currentNode.level + 1,
          childX,
          childY
        );
        const childIndex = this.indexMap.get(childKey);

        if (!childIndex) break;

        closestNode = childIndex;
        currentNode = this.getNodeView(childIndex);
      }
    }

    return closestNode;
  }

  public reset() {
    // Re-initialize buffer and indices
    this.nodeBuffer = new Float32Array(MAX_NODES * NODE_STRIDE);
    this.indexMap = new Map();
    this.nextIndex = 0;
    this.freeIndices = [];

    // Rebuild adjacency map and root nodes
    this.initFaceAdjacency();
    this.createRootNodes();
  }

  private getNodeHash(
    face: CubeFace,
    level: number,
    x: number,
    y: number
  ): number {
    // Bit packing: 3 bits face (0-5), 5 bits level (0-31), 12 bits x (0-4095), 12 bits y (0-4095)
    return (face << 29) | (level << 24) | (x << 12) | y;
  }
}

// Helper class for buffer access
class NodeView {
  private readonly offset: number;

  constructor(private buffer: Float32Array, private index: number) {
    this.offset = index * (NODE_STRIDE / 4);
  }

  get face() {
    return this.buffer[this.offset] as CubeFace;
  }
  get level() {
    return this.buffer[this.offset + 1];
  }
  get x() {
    return this.buffer[this.offset + 2];
  }
  get y() {
    return this.buffer[this.offset + 3];
  }
  get children() {
    return Array.from(
      this.buffer.subarray(this.offset + 4, this.offset + 8)
    ) as ChildIndices;
  }
  get neighbors() {
    return Array.from(
      this.buffer.subarray(this.offset + 11, this.offset + 15)
    ) as NeighborIndices;
  }
  get spherePos() {
    return [
      this.buffer[this.offset + 8],
      this.buffer[this.offset + 9],
      this.buffer[this.offset + 10],
    ] as SpherePos;
  }
  get errorMetric() {
    return this.buffer[this.offset + 16];
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

  get cubicCoordinates(): CubicCoordinates {
    return CubicCoordinates.fromUV(
      this.face,
      (this.x + 0.5) / (1 << this.level),
      (this.y + 0.5) / (1 << this.level)
    );
  }
}
