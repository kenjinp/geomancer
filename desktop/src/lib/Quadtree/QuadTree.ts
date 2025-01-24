import { Box3, Matrix4, Vector3 } from "three";
import { NodeBufferSlice } from "./NodeBufferSlice";

// Direction constants for neighbors
const NEIGHBOR_LEFT = 0;
const NEIGHBOR_RIGHT = 1;
const NEIGHBOR_TOP = 2;
const NEIGHBOR_BOTTOM = 3;

export interface LevelStats {
  level: number;
  nodeCount: number;
  averageSize: number;
}

export interface QuadTreeParams {
  localToWorld: Matrix4;
  size: number;
  minNodeSize: number;
  origin: Vector3;
  comparatorValue: number;
  nodeBuffer: NodeBufferSlice;
}

// Initialize return objects
const _tempVector3 = new Vector3();
const _tempVector3_2 = new Vector3();
const _tempSize = new Vector3();
const _tempBounds = new Box3();

// function Spherize(position: Vector3, radius: number) {
//   _tempVector3.copy(position).normalize().multiplyScalar(radius);
//   return _tempVector3;
// }

export class QuadTree {
  readonly nodeBuffer: NodeBufferSlice;
  private rootIndex: number;
  readonly localToWorld: Matrix4;
  private readonly minNodeSize: number;
  private readonly origin: Vector3;
  private readonly size: number; // corresponds to radius
  private readonly comparatorValue: number;

  // Reusable temporary objects
  private readonly _tempVec3 = new Vector3();
  private readonly _tempBox3 = new Box3();
  private readonly _tempMin = new Vector3();
  private readonly _tempMax = new Vector3();
  private readonly _tempChildBox = new Box3();
  private readonly _tempCenter = new Vector3();
  private readonly _tempSize = new Vector3();

  constructor(params: QuadTreeParams) {
    if (params.comparatorValue <= 0) {
      throw new Error("Quadtree Comparison Value must be greater than 0");
    }

    // Cache parameters
    this.localToWorld = params.localToWorld;
    this.minNodeSize = params.minNodeSize;
    this.origin = params.origin;
    this.size = params.size;
    this.comparatorValue = params.comparatorValue;

    // Initialize buffers and root node
    this.nodeBuffer = params.nodeBuffer;
    this.reset();
    // this.rootIndex = this.nodeBuffer.allocateNode();
  }

  public getNodeStartIndex() {
    return this.nodeBuffer.startIndex;
  }

  private calculateSphereCenter(center: Vector3, target: Vector3): Vector3 {
    return target
      .copy(center)
      .applyMatrix4(this.localToWorld)
      .normalize()
      .multiplyScalar(this.size)
      .add(this.origin);
  }

  private calculateChildBounds(
    parentBounds: Box3,
    midpoint: Vector3,
    index: number,
    target: Box3
  ): void {
    const min = parentBounds.min;
    const max = parentBounds.max;

    switch (index) {
      case 0: // Bottom left
        target.min.set(min.x, min.y, 0);
        target.max.set(midpoint.x, midpoint.y, 0);
        break;
      case 1: // Bottom right
        target.min.set(midpoint.x, min.y, 0);
        target.max.set(max.x, midpoint.y, 0);
        break;
      case 2: // Top left
        target.min.set(min.x, midpoint.y, 0);
        target.max.set(midpoint.x, max.y, 0);
        break;
      case 3: // Top right
        target.min.set(midpoint.x, midpoint.y, 0);
        target.max.set(max.x, max.y, 0);
        break;
    }
  }

  reset() {
    // Set up root node
    this.nodeBuffer.reset();
    this.rootIndex = this.nodeBuffer.allocateNode();

    this._tempMin.set(-this.size, -this.size, 0);
    this._tempMax.set(this.size, this.size, 0);
    this._tempBox3.set(this._tempMin, this._tempMax);

    const center = this._tempBox3.getCenter(this._tempCenter);
    const sphereCenter = this.calculateSphereCenter(center, this._tempVec3);
    const size = this._tempBox3.getSize(this._tempSize);

    this.nodeBuffer.setBounds(this.rootIndex, this._tempBox3);
    this.nodeBuffer.setCenter(this.rootIndex, center);
    this.nodeBuffer.setSphereCenter(this.rootIndex, sphereCenter);
    this.nodeBuffer.setSize(this.rootIndex, size);
    this.nodeBuffer.setFlags(this.rootIndex, 1); // Root flag
  }

  insert(pos: Vector3): void {
    this.insertRecursive(this.rootIndex, pos);
  }

  private insertRecursive(nodeIndex: number, pos: Vector3): void {
    const nodeBuffer = this.nodeBuffer;
    const sphereCenter = nodeBuffer.getSphereCenter(nodeIndex, this._tempVec3);
    const size = nodeBuffer.getSize(nodeIndex, this._tempSize);
    const distToNode = sphereCenter.distanceTo(pos);

    if (
      distToNode < size.x * this.comparatorValue &&
      size.x > this.minNodeSize
    ) {
      let childCount = nodeBuffer.getChildCount(nodeIndex);

      if (childCount === 0) {
        this.subdivide(nodeIndex);
        childCount = 4;
      }

      for (let i = 0; i < childCount; i++) {
        const childIndex = nodeBuffer.getChildIndex(nodeIndex, i);
        this.insertRecursive(childIndex, pos);
      }
    }
  }

  private subdivide(nodeIndex: number): void {
    const nodeBuffer = this.nodeBuffer;

    nodeBuffer.getBounds(nodeIndex, this._tempBox3);
    this._tempBox3.getCenter(this._tempCenter);

    // Create child nodes
    for (let i = 0; i < 4; i++) {
      const childIndex = nodeBuffer.allocateNode();
      nodeBuffer.setChildIndex(nodeIndex, i, childIndex);
      nodeBuffer.setParent(childIndex, nodeIndex);

      this.calculateChildBounds(
        this._tempBox3,
        this._tempCenter,
        i,
        this._tempChildBox
      );

      const childCenter = this._tempChildBox.getCenter(this._tempVec3);
      const childSphereCenter = this.calculateSphereCenter(
        childCenter,
        _tempVector3_2
      );
      const childSize = this._tempChildBox.getSize(this._tempSize);

      nodeBuffer.setBounds(childIndex, this._tempChildBox);
      nodeBuffer.setCenter(childIndex, childCenter);
      nodeBuffer.setSphereCenter(childIndex, childSphereCenter);
      nodeBuffer.setSize(childIndex, childSize);

      // Set up neighbor relationships for the new child
      this.setupChildNeighbors(nodeIndex, childIndex, i);
    }

    nodeBuffer.setChildCount(nodeIndex, 4);
  }

  private setupChildNeighbors(
    parentIndex: number,
    childIndex: number,
    childPosition: number
  ): void {
    const nodeBuffer = this.nodeBuffer;
    // Get parent's neighbors
    const parentNeighbors = {
      left: nodeBuffer.getNeighbor(parentIndex, NEIGHBOR_LEFT),
      right: nodeBuffer.getNeighbor(parentIndex, NEIGHBOR_RIGHT),
      top: nodeBuffer.getNeighbor(parentIndex, NEIGHBOR_TOP),
      bottom: nodeBuffer.getNeighbor(parentIndex, NEIGHBOR_BOTTOM),
    };

    // Set up internal neighbors between siblings
    switch (childPosition) {
      case 0: // Bottom left
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_RIGHT, parentIndex + 1);
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_TOP, parentIndex + 2);
        break;
      case 1: // Bottom right
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_LEFT, parentIndex);
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_TOP, parentIndex + 3);
        break;
      case 2: // Top left
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_RIGHT, parentIndex + 3);
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_BOTTOM, parentIndex);
        break;
      case 3: // Top right
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_LEFT, parentIndex + 2);
        nodeBuffer.setNeighbor(childIndex, NEIGHBOR_BOTTOM, parentIndex + 1);
        break;
    }

    // Connect to external neighbors if they exist and are at the same level
    this.connectToExternalNeighbors(childIndex, childPosition, parentNeighbors);
  }

  private connectToExternalNeighbors(
    childIndex: number,
    childPosition: number,
    parentNeighbors: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }
  ): void {
    // Helper to find corresponding child of neighbor
    const getNeighborChild = (
      neighborIndex: number,
      childPos: number
    ): number => {
      if (neighborIndex === -1) return -1;
      const childCount = this.nodeBuffer.getChildCount(neighborIndex);
      return childCount === 4
        ? this.nodeBuffer.getChildIndex(neighborIndex, childPos)
        : -1;
    };

    // Connect based on child position
    switch (childPosition) {
      case 0: // Bottom left
        if (parentNeighbors.left !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_LEFT,
            getNeighborChild(parentNeighbors.left, 1)
          );
        if (parentNeighbors.bottom !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_BOTTOM,
            getNeighborChild(parentNeighbors.bottom, 2)
          );
        break;
      case 1: // Bottom right
        if (parentNeighbors.right !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_RIGHT,
            getNeighborChild(parentNeighbors.right, 0)
          );
        if (parentNeighbors.bottom !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_BOTTOM,
            getNeighborChild(parentNeighbors.bottom, 3)
          );
        break;
      case 2: // Top left
        if (parentNeighbors.left !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_LEFT,
            getNeighborChild(parentNeighbors.left, 3)
          );
        if (parentNeighbors.top !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_TOP,
            getNeighborChild(parentNeighbors.top, 0)
          );
        break;
      case 3: // Top right
        if (parentNeighbors.right !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_RIGHT,
            getNeighborChild(parentNeighbors.right, 2)
          );
        if (parentNeighbors.top !== -1)
          this.nodeBuffer.setNeighbor(
            childIndex,
            NEIGHBOR_TOP,
            getNeighborChild(parentNeighbors.top, 1)
          );
        break;
    }
  }

  // Helper methods for traversing the tree structure
  getNodeNeighbors(nodeIndex: number): number[] {
    return [
      this.nodeBuffer.getNeighbor(nodeIndex, NEIGHBOR_LEFT),
      this.nodeBuffer.getNeighbor(nodeIndex, NEIGHBOR_RIGHT),
      this.nodeBuffer.getNeighbor(nodeIndex, NEIGHBOR_TOP),
      this.nodeBuffer.getNeighbor(nodeIndex, NEIGHBOR_BOTTOM),
    ];
  }

  getNodeParent(nodeIndex: number): number {
    return this.nodeBuffer.getParent(nodeIndex);
  }

  // Method to find neighboring nodes at same or similar level
  findNeighborAtLevel(
    nodeIndex: number,
    direction: number,
    targetSize: number
  ): number {
    let current = nodeIndex;
    const nodeBuffer = this.nodeBuffer;
    let neighbor = nodeBuffer.getNeighbor(current, direction);

    while (neighbor !== -1) {
      const neighborSize = nodeBuffer.getSize(neighbor, this._tempVec3);
      if (Math.abs(neighborSize.x - targetSize) < this.minNodeSize) {
        return neighbor;
      }

      // If neighbor is too large, traverse down to find a closer match
      if (neighborSize.x > targetSize) {
        const childIndex = this.getAppropriateChild(neighbor, direction);
        if (childIndex === -1) break;
        neighbor = childIndex;
      } else {
        // If neighbor is too small, go up to parent
        const parentIndex = nodeBuffer.getParent(neighbor);
        if (parentIndex === -1) break;
        neighbor = parentIndex;
      }
    }

    return -1;
  }

  private getAppropriateChild(nodeIndex: number, direction: number): number {
    const childCount = this.nodeBuffer.getChildCount(nodeIndex);
    if (childCount === 0) return -1;

    // Select appropriate child based on direction
    switch (direction) {
      case NEIGHBOR_LEFT:
        return this.nodeBuffer.getChildIndex(nodeIndex, 1); // right child
      case NEIGHBOR_RIGHT:
        return this.nodeBuffer.getChildIndex(nodeIndex, 0); // left child
      case NEIGHBOR_TOP:
        return this.nodeBuffer.getChildIndex(nodeIndex, 2); // bottom child
      case NEIGHBOR_BOTTOM:
        return this.nodeBuffer.getChildIndex(nodeIndex, 0); // top child
      default:
        return -1;
    }
  }

  iterateNodes(cb: (nodeIndex: number) => void) {
    this.nodeBuffer.iterate(cb);
  }

  getNodeLevelStatistics(): LevelStats[] {
    const levelCounts = new Map<number, { count: number; totalSize: number }>();

    // Get stats for each node
    this.nodeBuffer.iterate((nodeIndex) => {
      const level = this.getNodeLevel(nodeIndex);
      const size = this.nodeBuffer.getSize(nodeIndex, new Vector3());

      if (!levelCounts.has(level)) {
        levelCounts.set(level, { count: 0, totalSize: 0 });
      }

      const stats = levelCounts.get(level)!;
      stats.count++;
      stats.totalSize += size.x; // Use x component since it's a square
    });

    // Convert to array and calculate averages
    const stats: LevelStats[] = Array.from(levelCounts.entries())
      .map(([level, stats]) => ({
        level,
        nodeCount: stats.count,
        averageSize: stats.totalSize / stats.count,
      }))
      .sort((a, b) => a.level - b.level);

    return stats;
  }

  getNodeLevel(nodeIndex: number): number {
    let level = 0;
    let currentIndex = nodeIndex;

    const nodeBuffer = this.nodeBuffer;

    // Traverse up the tree until we reach the root
    while (currentIndex !== 0) {
      // 0 is the root index
      const parentIndex = nodeBuffer.getParent(currentIndex);
      if (parentIndex === -1) break;
      level++;
      currentIndex = parentIndex;
    }

    return level;
  }

  // Helper method to get a text summary
  getTreeSummary() {
    const stats = this.getNodeLevelStatistics();
    const totalNodes = stats.reduce((sum, stat) => sum + stat.nodeCount, 0);

    return {
      stats,
      totalNodes,
      subdivisionLevel: stats.length,
    };
  }

  findClosestNode(point: Vector3): {
    nodeIndex: number;
    distance: number;
  } {
    let closestNodeIndex = 0;
    let closestDistance = Infinity;
    const center = _tempVector3;
    const size = _tempSize;
    const nodeBuffer = this.nodeBuffer;

    const searchNode = (nodeIndex: number) => {
      nodeBuffer.getCenter(nodeIndex, center);
      nodeBuffer.getSize(nodeIndex, size);

      const distance = point.distanceTo(center);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestNodeIndex = nodeIndex;
      }

      let childCount = nodeBuffer.getChildCount(nodeIndex);
      if (childCount > 0) {
        for (let i = 0; i < childCount; i++) {
          const childIndex = nodeBuffer.getChildIndex(nodeIndex, i);
          if (childIndex !== -1 && childIndex !== nodeIndex) {
            searchNode(childIndex);
          }
        }
      }
    };

    searchNode(0);
    return { nodeIndex: closestNodeIndex, distance: closestDistance };
  }

  getNodeInfo(nodeIndex: number): {
    center: Vector3;
    size: Vector3;
    bounds: Box3;
    childCount: number;
    level: number;
  } {
    const nodeBuffer = this.nodeBuffer;

    // Initialize return objects
    const center = _tempVector3;
    const size = _tempSize;
    const bounds = _tempBounds;

    // Get node properties from buffer
    nodeBuffer.getCenter(nodeIndex, center);
    nodeBuffer.getSize(nodeIndex, size);
    nodeBuffer.getBounds(nodeIndex, bounds);
    const childCount = nodeBuffer.getChildCount(nodeIndex);

    // Calculate node level by traversing up to root
    let level = 0;
    let currentNode = nodeIndex;
    while (currentNode !== 0) {
      // 0 is root index
      const parentIndex = nodeBuffer.getParent(currentNode);
      if (parentIndex === -1) break;
      level++;
      currentNode = parentIndex;
    }

    return {
      center,
      size,
      bounds,
      childCount,
      level,
    };
  }
}
