import { Box3, Matrix4, Vector3 } from "three";
import { NodeBufferSlice } from "./NodeBufferSlice";
import { FLAGS } from "./constants";
// Direction constants for neighbors
const DIRECTION_NEIGHBOR_LEFT = 0;
const DIRECTION_NEIGHBOR_RIGHT = 1;
const DIRECTION_NEIGHBOR_TOP = 2;
const DIRECTION_NEIGHBOR_BOTTOM = 3;

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
    // Set root flags: IS_ROOT | IS_LEAF | IS_BOUNDARY
    this.nodeBuffer.setFlags(
      this.rootIndex,
      FLAGS.IS_ROOT | FLAGS.IS_LEAF | FLAGS.IS_BOUNDARY
    );
  }

  insert(pos: Vector3): void {
    this.insertRecursive(this.rootIndex, pos);
  }

  private insertRecursive(nodeIndex: number, pos: Vector3): void {
    const nodeBuffer = this.nodeBuffer;
    const sphereCenter = nodeBuffer.getSphereCenter(nodeIndex, this._tempVec3);
    const size = nodeBuffer.getSize(nodeIndex, this._tempSize);
    const distToNode = sphereCenter.distanceTo(pos);

    // If this node is close enough to the point and large enough, subdivide it
    if (
      distToNode < size.x * this.comparatorValue &&
      size.x > this.minNodeSize * 2
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

    // Update parent node flags - remove IS_LEAF, add IS_SPLIT
    const currentFlags = nodeBuffer.getFlags(nodeIndex);
    nodeBuffer.setFlags(
      nodeIndex,
      (currentFlags & ~FLAGS.IS_LEAF) | FLAGS.IS_SPLIT
    );

    nodeBuffer.getBounds(nodeIndex, this._tempBox3);
    this._tempBox3.getCenter(this._tempCenter);

    // Create child nodes
    const childIndices: number[] = [];
    for (let i = 0; i < 4; i++) {
      const childIndex = nodeBuffer.allocateNode();
      childIndices.push(childIndex);
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

      // Set child flags: IS_LEAF by default, add IS_BOUNDARY for edge nodes
      let childFlags = FLAGS.IS_LEAF;

      // Check if child is on boundary (based on index)
      if (i === 0) {
        // Bottom left
        childFlags |= FLAGS.IS_BOUNDARY;
      } else if (i === 1) {
        // Bottom right
        childFlags |= FLAGS.IS_BOUNDARY;
      } else if (i === 2) {
        // Top left
        childFlags |= FLAGS.IS_BOUNDARY;
      } else if (i === 3) {
        // Top right
        childFlags |= FLAGS.IS_BOUNDARY;
      }

      nodeBuffer.setFlags(childIndex, childFlags);
    }

    // Set up neighbor relationships between siblings
    // Bottom Left (0)
    nodeBuffer.setNeighbor(
      childIndices[0],
      DIRECTION_NEIGHBOR_RIGHT,
      childIndices[1]
    ); // -> Bottom Right
    nodeBuffer.setNeighbor(
      childIndices[0],
      DIRECTION_NEIGHBOR_TOP,
      childIndices[2]
    ); // -> Top Left

    // Bottom Right (1)
    nodeBuffer.setNeighbor(
      childIndices[1],
      DIRECTION_NEIGHBOR_LEFT,
      childIndices[0]
    ); // -> Bottom Left
    nodeBuffer.setNeighbor(
      childIndices[1],
      DIRECTION_NEIGHBOR_TOP,
      childIndices[3]
    ); // -> Top Right

    // Top Left (2)
    nodeBuffer.setNeighbor(
      childIndices[2],
      DIRECTION_NEIGHBOR_RIGHT,
      childIndices[3]
    ); // -> Top Right
    nodeBuffer.setNeighbor(
      childIndices[2],
      DIRECTION_NEIGHBOR_BOTTOM,
      childIndices[0]
    ); // -> Bottom Left

    // Top Right (3)
    nodeBuffer.setNeighbor(
      childIndices[3],
      DIRECTION_NEIGHBOR_LEFT,
      childIndices[2]
    ); // -> Top Left
    nodeBuffer.setNeighbor(
      childIndices[3],
      DIRECTION_NEIGHBOR_BOTTOM,
      childIndices[1]
    ); // -> Bottom Right

    // After setting up sibling relationships, we need to connect children across quadrants
    // Get the node's neighbors
    const parentNeighbors = this.getNodeNeighbors(nodeIndex);
    const [leftNeighbor, rightNeighbor, topNeighbor, bottomNeighbor] =
      parentNeighbors;

    // Connect with existing subdivided neighbors
    this.connectWithNeighbor(
      nodeIndex,
      childIndices,
      rightNeighbor,
      DIRECTION_NEIGHBOR_RIGHT
    );
    this.connectWithNeighbor(
      nodeIndex,
      childIndices,
      leftNeighbor,
      DIRECTION_NEIGHBOR_LEFT
    );
    this.connectWithNeighbor(
      nodeIndex,
      childIndices,
      topNeighbor,
      DIRECTION_NEIGHBOR_TOP
    );
    this.connectWithNeighbor(
      nodeIndex,
      childIndices,
      bottomNeighbor,
      DIRECTION_NEIGHBOR_BOTTOM
    );

    nodeBuffer.setChildCount(nodeIndex, 4);
  }

  private connectWithNeighbor(
    nodeIndex: number,
    childIndices: number[],
    neighbor: number,
    direction: number
  ): void {
    if (neighbor === -1 || this.nodeBuffer.getChildCount(neighbor) === 0) {
      return;
    }

    const nodeBuffer = this.nodeBuffer;

    switch (direction) {
      case DIRECTION_NEIGHBOR_RIGHT: {
        // Connect bottom-right to bottom-left of right neighbor
        const neighborBottomLeft = nodeBuffer.getChildIndex(neighbor, 0);
        const neighborTopLeft = nodeBuffer.getChildIndex(neighbor, 2);

        nodeBuffer.setNeighbor(
          childIndices[1],
          DIRECTION_NEIGHBOR_RIGHT,
          neighborBottomLeft
        );
        nodeBuffer.setNeighbor(
          neighborBottomLeft,
          DIRECTION_NEIGHBOR_LEFT,
          childIndices[1]
        );

        nodeBuffer.setNeighbor(
          childIndices[3],
          DIRECTION_NEIGHBOR_RIGHT,
          neighborTopLeft
        );
        nodeBuffer.setNeighbor(
          neighborTopLeft,
          DIRECTION_NEIGHBOR_LEFT,
          childIndices[3]
        );
        break;
      }
      case DIRECTION_NEIGHBOR_LEFT: {
        // Connect bottom-left to bottom-right of left neighbor
        const neighborBottomRight = nodeBuffer.getChildIndex(neighbor, 1);
        const neighborTopRight = nodeBuffer.getChildIndex(neighbor, 3);

        nodeBuffer.setNeighbor(
          childIndices[0],
          DIRECTION_NEIGHBOR_LEFT,
          neighborBottomRight
        );
        nodeBuffer.setNeighbor(
          neighborBottomRight,
          DIRECTION_NEIGHBOR_RIGHT,
          childIndices[0]
        );

        nodeBuffer.setNeighbor(
          childIndices[2],
          DIRECTION_NEIGHBOR_LEFT,
          neighborTopRight
        );
        nodeBuffer.setNeighbor(
          neighborTopRight,
          DIRECTION_NEIGHBOR_RIGHT,
          childIndices[2]
        );
        break;
      }
      case DIRECTION_NEIGHBOR_TOP: {
        // Connect top children to bottom children of top neighbor
        const neighborBottomLeft = nodeBuffer.getChildIndex(neighbor, 0);
        const neighborBottomRight = nodeBuffer.getChildIndex(neighbor, 1);

        nodeBuffer.setNeighbor(
          childIndices[2],
          DIRECTION_NEIGHBOR_TOP,
          neighborBottomLeft
        );
        nodeBuffer.setNeighbor(
          neighborBottomLeft,
          DIRECTION_NEIGHBOR_BOTTOM,
          childIndices[2]
        );

        nodeBuffer.setNeighbor(
          childIndices[3],
          DIRECTION_NEIGHBOR_TOP,
          neighborBottomRight
        );
        nodeBuffer.setNeighbor(
          neighborBottomRight,
          DIRECTION_NEIGHBOR_BOTTOM,
          childIndices[3]
        );
        break;
      }
      case DIRECTION_NEIGHBOR_BOTTOM: {
        // Connect bottom children to top children of bottom neighbor
        const neighborTopLeft = nodeBuffer.getChildIndex(neighbor, 2);
        const neighborTopRight = nodeBuffer.getChildIndex(neighbor, 3);

        nodeBuffer.setNeighbor(
          childIndices[0],
          DIRECTION_NEIGHBOR_BOTTOM,
          neighborTopLeft
        );
        nodeBuffer.setNeighbor(
          neighborTopLeft,
          DIRECTION_NEIGHBOR_TOP,
          childIndices[0]
        );

        nodeBuffer.setNeighbor(
          childIndices[1],
          DIRECTION_NEIGHBOR_BOTTOM,
          neighborTopRight
        );
        nodeBuffer.setNeighbor(
          neighborTopRight,
          DIRECTION_NEIGHBOR_TOP,
          childIndices[1]
        );
        break;
      }
    }
  }

  // Helper methods for traversing the tree structure
  getNodeNeighbors(nodeIndex: number): number[] {
    return [
      this.nodeBuffer.getNeighbor(nodeIndex, DIRECTION_NEIGHBOR_LEFT),
      this.nodeBuffer.getNeighbor(nodeIndex, DIRECTION_NEIGHBOR_RIGHT),
      this.nodeBuffer.getNeighbor(nodeIndex, DIRECTION_NEIGHBOR_TOP),
      this.nodeBuffer.getNeighbor(nodeIndex, DIRECTION_NEIGHBOR_BOTTOM),
    ];
  }

  getNodeParent(nodeIndex: number): number {
    return this.nodeBuffer.getParent(nodeIndex);
  }

  // Method to find neighboring nodes at same or similar level
  private findNeighborAtLevel(
    nodeIndex: number,
    direction: number,
    targetSize: number
  ): number {
    const nodeBuffer = this.nodeBuffer;
    let current = nodeIndex;
    let currentSize = nodeBuffer.getSize(current, this._tempVec3).x;

    // If we're too small, traverse up until we find a parent at the right size
    while (currentSize < targetSize) {
      const parent = nodeBuffer.getParent(current);
      if (parent === -1) return -1;
      current = parent;
      currentSize = nodeBuffer.getSize(current, this._tempVec3).x;
    }

    // Get the neighbor at this level
    let neighbor = nodeBuffer.getNeighbor(current, direction);
    if (neighbor === -1) return -1;

    // If the neighbor is the right size, return it
    const neighborSize = nodeBuffer.getSize(neighbor, this._tempVec3).x;
    if (Math.abs(neighborSize - targetSize) < this.minNodeSize) {
      return neighbor;
    }

    // If the neighbor is larger, return -1 (no appropriate neighbor exists)
    if (neighborSize > targetSize) {
      return -1;
    }

    // If we get here, the neighbor is smaller and we need to traverse down
    while (neighborSize < targetSize) {
      const childIndex = this.getAppropriateChild(neighbor, direction);
      if (childIndex === -1) break;
      neighbor = childIndex;
    }

    return neighbor;
  }

  private getAppropriateChild(nodeIndex: number, direction: number): number {
    const childCount = this.nodeBuffer.getChildCount(nodeIndex);
    if (childCount === 0) return -1;

    // Select appropriate child based on direction
    switch (direction) {
      case DIRECTION_NEIGHBOR_LEFT:
        return this.nodeBuffer.getChildIndex(nodeIndex, 0); // left children (0 or 2)
      case DIRECTION_NEIGHBOR_RIGHT:
        return this.nodeBuffer.getChildIndex(nodeIndex, 1); // right children (1 or 3)
      case DIRECTION_NEIGHBOR_TOP:
        return this.nodeBuffer.getChildIndex(nodeIndex, 2); // top children (2 or 3)
      case DIRECTION_NEIGHBOR_BOTTOM:
        return this.nodeBuffer.getChildIndex(nodeIndex, 0); // bottom children (0 or 1)
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
    const totalNodes = this.nodeBuffer.size;

    return {
      stats,
      totalNodes,
      subdivisionLevels: stats.length,
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

      // convert the local-space center to world space, and place it on the sphere
      const sphereCenter = this.calculateSphereCenter(center, _tempVector3_2);

      const distance = point.distanceTo(sphereCenter);

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
    isRoot: boolean;
    isLeaf: boolean;
    isSplit: boolean;
    isBoundary: boolean;
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

    const flags = nodeBuffer.getFlags(nodeIndex);

    return {
      center,
      size,
      bounds,
      childCount,
      level,
      isRoot: (flags & FLAGS.IS_ROOT) !== 0,
      isLeaf: (flags & FLAGS.IS_LEAF) !== 0,
      isSplit: (flags & FLAGS.IS_SPLIT) !== 0,
      isBoundary: (flags & FLAGS.IS_BOUNDARY) !== 0,
    };
  }

  /**
   * Calculates the expected number of nodes for a given number of subdivision levels
   * @param levels Number of subdivision levels (0 means just the root node)
   * @returns {number} Total number of nodes
   *
   * Example:
   * - levels = 0: 1 node (just root)
   * - levels = 1: 5 nodes (root + 4 children)
   * - levels = 2: 21 nodes (root + 4 + 16)
   * - levels = 3: 85 nodes (root + 4 + 16 + 64)
   */
  static getExpectedNodeCount(levels: number): number {
    if (levels < 0) return 0;
    // Using the geometric series formula: (4^(n+1) - 1) / 3
    return (Math.pow(4, levels + 1) - 1) / 3;
  }

  /**
   * Returns the maximum number of nodes possible at a specific level
   * @param level The level to calculate (0 is root)
   * @returns {number} Number of nodes at that level
   *
   * Example:
   * - level 0: 1 node
   * - level 1: 4 nodes
   * - level 2: 16 nodes
   * - level 3: 64 nodes
   */
  static getNodesAtLevel(level: number): number {
    if (level < 0) return 0;
    return Math.pow(4, level);
  }

  // Add a new method to find neighbors at any level
  public findNeighbors(nodeIndex: number, direction: number): number[] {
    const neighbors: number[] = [];
    const nodeBuffer = this.nodeBuffer;
    const nodeSize = nodeBuffer.getSize(nodeIndex, this._tempVec3).x;

    // First check direct neighbor
    let neighbor = nodeBuffer.getNeighbor(nodeIndex, direction);
    if (neighbor !== -1) {
      neighbors.push(neighbor);
    }

    // Then check parent's neighbors if they exist
    let current = nodeIndex;
    while (true) {
      const parent = nodeBuffer.getParent(current);
      if (parent === -1) break;

      const parentNeighbor = nodeBuffer.getNeighbor(parent, direction);
      if (parentNeighbor !== -1) {
        neighbors.push(parentNeighbor);
      }
      current = parent;
    }

    return neighbors;
  }
}
