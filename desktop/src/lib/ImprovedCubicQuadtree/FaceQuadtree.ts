import { Vector3 } from "three";
import { UnifiedNodeBuffer } from "./UnifiedNodeBuffer";
import { ChildIndex, Direction, QuadtreeConstants } from "./constants";
import { CubeFace } from "./types";

export class FaceQuadtree {
  private buffer: UnifiedNodeBuffer;
  private rootIndex: number;
  private face: CubeFace;
  private radius: number;
  private minDistanceThreshold: number;

  constructor(
    buffer: UnifiedNodeBuffer,
    face: CubeFace,
    radius: number,
    minDistanceThreshold: number
  ) {
    this.buffer = buffer;
    this.face = face;
    this.radius = radius;
    this.minDistanceThreshold = minDistanceThreshold;
    this.rootIndex = this.createRootNode();
  }

  private createRootNode(): number {
    const index = this.buffer.allocateNode();
    this.buffer.setX(index, 0);
    this.buffer.setY(index, 0);
    this.buffer.setLevel(index, QuadtreeConstants.ROOT_LEVEL);
    this.buffer.setSize(index, QuadtreeConstants.ROOT_SIZE);
    this.buffer.setChildIndex(
      index,
      ChildIndex.TOP_LEFT,
      QuadtreeConstants.INVALID_INDEX
    );
    this.buffer.setChildIndex(
      index,
      ChildIndex.TOP_RIGHT,
      QuadtreeConstants.INVALID_INDEX
    );
    this.buffer.setChildIndex(
      index,
      ChildIndex.BOTTOM_LEFT,
      QuadtreeConstants.INVALID_INDEX
    );
    this.buffer.setChildIndex(
      index,
      ChildIndex.BOTTOM_RIGHT,
      QuadtreeConstants.INVALID_INDEX
    );
    this.buffer.setFaceIndex(index, this.face);
    this.buffer.setHasChildren(index, false);

    // Initialize all neighbors to invalid
    Object.values(Direction).forEach((direction) => {
      if (typeof direction === "number") {
        this.buffer.setNeighbor(
          index,
          direction,
          QuadtreeConstants.INVALID_INDEX
        );
      }
    });

    return index;
  }

  public insert(point: Vector3): void {
    this.insertAtNode(this.rootIndex, point);
  }

  private insertAtNode(nodeIndex: number, point: Vector3): void {
    if (!this.containsPoint(nodeIndex, point)) {
      return;
    }

    const nodeSize = this.buffer.getSize(nodeIndex);
    const distanceThreshold = this.calculateDistanceThreshold(nodeSize);

    // Calculate the world position of the node center for distance comparison
    const nodeCenterWorld = this.calculateNodeCenterWorld(nodeIndex);
    const distance = point.distanceTo(nodeCenterWorld);

    if (
      !this.buffer.getHasChildren(nodeIndex) &&
      this.buffer.getLevel(nodeIndex) < QuadtreeConstants.MAX_DEPTH &&
      distance > distanceThreshold
    ) {
      this.subdivide(nodeIndex);
    }

    if (this.buffer.getHasChildren(nodeIndex)) {
      const childPosition = this.getChildIndexForPoint(nodeIndex, point);
      const childIndex = this.buffer.getChildIndex(nodeIndex, childPosition);
      this.insertAtNode(childIndex, point);
    }
  }

  private containsPoint(nodeIndex: number, point: Vector3): boolean {
    const nodeX = this.buffer.getX(nodeIndex);
    const nodeY = this.buffer.getY(nodeIndex);
    const nodeSize = this.buffer.getSize(nodeIndex);
    const halfSize = nodeSize / 2;

    // Adjust bounds check for normalized coordinates
    return (
      point.x >= nodeX - halfSize &&
      point.x <= nodeX + halfSize &&
      point.y >= nodeY - halfSize &&
      point.y <= nodeY + halfSize
    );
  }

  private getChildIndexForPoint(nodeIndex: number, point: Vector3): number {
    const nodeX = this.buffer.getX(nodeIndex);
    const nodeY = this.buffer.getY(nodeIndex);
    const nodeSize = this.buffer.getSize(nodeIndex);
    const midX = nodeX - 1 + nodeSize / 2;
    const midY = nodeY - 1 + nodeSize / 2;

    const right = point.x >= midX;
    const bottom = point.y >= midY;

    return (bottom ? 2 : 0) + (right ? 1 : 0);
  }

  private calculateDistanceThreshold(nodeSize: number): number {
    // Adjust threshold calculation
    return this.minDistanceThreshold * nodeSize * this.radius;
  }

  private calculateNodeCenterWorld(nodeIndex: number): Vector3 {
    const nodeX = this.buffer.getX(nodeIndex);
    const nodeY = this.buffer.getY(nodeIndex);
    const nodeSize = this.buffer.getSize(nodeIndex);

    // Get center in face coordinates (-1 to 1)
    const centerX = nodeX - 1 + nodeSize / 2;
    const centerY = nodeY - 1 + nodeSize / 2;

    // Convert to world coordinates on sphere
    return this.faceToWorldCoordinates(centerX, centerY);
  }

  private faceToWorldCoordinates(x: number, y: number): Vector3 {
    // Create point on unit cube face (z = 1 since we're on the face)
    const point = new Vector3(x, y, 1);

    // Project to sphere surface
    point.normalize().multiplyScalar(this.radius);

    return point;
  }

  private subdivide(nodeIndex: number): void {
    const nodeX = this.buffer.getX(nodeIndex);
    const nodeY = this.buffer.getY(nodeIndex);
    const nodeLevel = this.buffer.getLevel(nodeIndex);
    const nodeSize = this.buffer.getSize(nodeIndex);
    const halfSize = nodeSize / 2;
    const childIndices: number[] = [];

    // Create four children
    for (let i = 0; i < QuadtreeConstants.CHILD_COUNT; i++) {
      const childIndex = this.buffer.allocateNode();
      childIndices.push(childIndex);

      const offsetX = (i % 2) * halfSize - halfSize / 2;
      const offsetY = Math.floor(i / 2) * halfSize - halfSize / 2;

      this.buffer.setX(childIndex, nodeX + offsetX);
      this.buffer.setY(childIndex, nodeY + offsetY);
      this.buffer.setLevel(childIndex, nodeLevel + 1);
      this.buffer.setSize(childIndex, halfSize);
      this.buffer.setFaceIndex(childIndex, this.face);
      this.buffer.setHasChildren(childIndex, false);

      // Initialize neighbors
      Object.values(Direction).forEach((direction) => {
        if (typeof direction === "number") {
          this.buffer.setNeighbor(
            childIndex,
            direction,
            QuadtreeConstants.INVALID_INDEX
          );
        }
      });
    }

    // Update parent and set neighbor relationships
    this.buffer.setHasChildren(nodeIndex, true);
    this.buffer.setChildIndices(nodeIndex, childIndices);
    this.updateNeighborRelationships(childIndices);
  }

  private updateNeighborRelationships(childIndices: number[]): void {
    for (let i = 0; i < QuadtreeConstants.CHILD_COUNT; i++) {
      if (i % 2 === 0) {
        this.buffer.setNeighbor(
          childIndices[i],
          Direction.EAST,
          childIndices[i + 1]
        );
      }
      if (i % 2 === 1) {
        this.buffer.setNeighbor(
          childIndices[i],
          Direction.WEST,
          childIndices[i - 1]
        );
      }
      if (i < 2) {
        this.buffer.setNeighbor(
          childIndices[i],
          Direction.SOUTH,
          childIndices[i + 2]
        );
      }
      if (i >= 2) {
        this.buffer.setNeighbor(
          childIndices[i],
          Direction.NORTH,
          childIndices[i - 2]
        );
      }
    }
  }
}
