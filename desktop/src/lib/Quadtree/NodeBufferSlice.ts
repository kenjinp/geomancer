import { Box3, Vector3 } from "three";
import {
  NODE_FLOAT_COUNT,
  NODE_INT_COUNT,
  NodeFloatIndex,
  NodeIntIndex,
} from "./constants";

// Shares memory with all NodeBufferSlices
export class NodeBufferSlice {
  private floatBuffer: Float32Array;
  private intBuffer: Int32Array;
  private nodeCount: number = 0;
  readonly startIndex: number;
  readonly maxNodes: number;

  constructor(
    floatBuffer: Float32Array,
    intBuffer: Int32Array,
    startIndex: number,
    maxNodes: number
  ) {
    this.floatBuffer = floatBuffer;
    this.intBuffer = intBuffer;
    this.startIndex = startIndex;
    this.maxNodes = maxNodes;
    this.nodeCount = 1; // Start with root node
  }

  get size(): number {
    return this.nodeCount;
  }

  getNodeAbsoluteIndex(nodeIndex: number) {
    return this.startIndex + nodeIndex;
  }

  iterate = (callback: (node: number) => void): void => {
    for (let i = 0; i < this.nodeCount; i++) {
      callback(i);
    }
  };

  createNode(index: number): void {
    this.setChildCount(index, 0);
    this.setChildIndex(index, NodeIntIndex.CHILD_BOTTOM_LEFT, -1);
    this.setChildIndex(index, NodeIntIndex.CHILD_BOTTOM_RIGHT, -1);
    this.setChildIndex(index, NodeIntIndex.CHILD_TOP_LEFT, -1);
    this.setChildIndex(index, NodeIntIndex.CHILD_TOP_RIGHT, -1);
    this.setFlags(index, 0);
    this.setParent(index, -1);
    this.setFace(index, -1); // unset for now//
    // Initialize neighbors to -1 (no neighbor)
    this.setNeighbor(index, NodeIntIndex.NEIGHBOR_LEFT, -1);
    this.setNeighbor(index, NodeIntIndex.NEIGHBOR_RIGHT, -1);
    this.setNeighbor(index, NodeIntIndex.NEIGHBOR_TOP, -1);
    this.setNeighbor(index, NodeIntIndex.NEIGHBOR_BOTTOM, -1);
  }

  reset(): void {
    // Reset float buffer to initial state
    const floatStart = this.startIndex * NODE_FLOAT_COUNT;
    const floatEnd = floatStart + this.maxNodes * NODE_FLOAT_COUNT;
    this.floatBuffer.fill(0, floatStart, floatEnd);

    // Reset int buffer to initial state
    const intStart = this.startIndex * NODE_INT_COUNT;
    const intEnd = intStart + this.maxNodes * NODE_INT_COUNT;

    // Fill all int values with -1 first
    this.intBuffer.fill(-1, intStart, intEnd);

    // Reset node count
    this.nodeCount = 0;
  }

  private getFloatOffset(nodeIndex: number): number {
    // return nodeIndex * NODE_FLOAT_COUNT;
    return (this.startIndex + nodeIndex) * NODE_FLOAT_COUNT;
  }

  private getIntOffset(nodeIndex: number): number {
    // return nodeIndex * NODE_INT_COUNT;
    return (this.startIndex + nodeIndex) * NODE_INT_COUNT;
  }

  allocateNode(): number {
    const index = this.nodeCount++;
    if (index >= this.maxNodes) {
      throw new Error(
        `Maximum node count exceeded for buffer slice (${this.maxNodes})`
      );
    }
    this.createNode(index);
    return index;
  }

  setCenter(nodeIndex: number, center: Vector3): void {
    const offset = this.getFloatOffset(nodeIndex);
    this.floatBuffer[offset + NodeFloatIndex.CENTER_X] = center.x;
    this.floatBuffer[offset + NodeFloatIndex.CENTER_Y] = center.y;
    this.floatBuffer[offset + NodeFloatIndex.CENTER_Z] = center.z;
  }

  getCenter(nodeIndex: number, target: Vector3): Vector3 {
    const offset = this.getFloatOffset(nodeIndex);
    return target.set(
      this.floatBuffer[offset + NodeFloatIndex.CENTER_X],
      this.floatBuffer[offset + NodeFloatIndex.CENTER_Y],
      this.floatBuffer[offset + NodeFloatIndex.CENTER_Z]
    );
  }

  setSphereCenter(nodeIndex: number, center: Vector3): void {
    const offset = this.getFloatOffset(nodeIndex);
    this.floatBuffer[offset + NodeFloatIndex.SPHERE_CENTER_X] = center.x;
    this.floatBuffer[offset + NodeFloatIndex.SPHERE_CENTER_Y] = center.y;
    this.floatBuffer[offset + NodeFloatIndex.SPHERE_CENTER_Z] = center.z;
  }

  getSphereCenter(nodeIndex: number, target: Vector3): Vector3 {
    const offset = this.getFloatOffset(nodeIndex);
    return target.set(
      this.floatBuffer[offset + NodeFloatIndex.SPHERE_CENTER_X],
      this.floatBuffer[offset + NodeFloatIndex.SPHERE_CENTER_Y],
      this.floatBuffer[offset + NodeFloatIndex.SPHERE_CENTER_Z]
    );
  }

  setSize(nodeIndex: number, size: Vector3): void {
    const offset = this.getFloatOffset(nodeIndex);
    this.floatBuffer[offset + NodeFloatIndex.SIZE_X] = size.x;
    this.floatBuffer[offset + NodeFloatIndex.SIZE_Y] = size.y;
    this.floatBuffer[offset + NodeFloatIndex.SIZE_Z] = size.z;
  }

  getSize(nodeIndex: number, target: Vector3): Vector3 {
    const offset = this.getFloatOffset(nodeIndex);
    return target.set(
      this.floatBuffer[offset + NodeFloatIndex.SIZE_X],
      this.floatBuffer[offset + NodeFloatIndex.SIZE_Y],
      this.floatBuffer[offset + NodeFloatIndex.SIZE_Z]
    );
  }

  setBounds(nodeIndex: number, bounds: Box3): void {
    const offset = this.getFloatOffset(nodeIndex);
    this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MIN_X] = bounds.min.x;
    this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MIN_Y] = bounds.min.y;
    this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MIN_Z] = bounds.min.z;
    this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MAX_X] = bounds.max.x;
    this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MAX_Y] = bounds.max.y;
    this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MAX_Z] = bounds.max.z;
  }

  getBounds(nodeIndex: number, target: Box3): Box3 {
    const offset = this.getFloatOffset(nodeIndex);
    target.min.set(
      this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MIN_X],
      this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MIN_Y],
      this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MIN_Z]
    );
    target.max.set(
      this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MAX_X],
      this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MAX_Y],
      this.floatBuffer[offset + NodeFloatIndex.BOUNDS_MAX_Z]
    );
    return target;
  }

  setChildIndex(
    nodeIndex: number,
    childSlot: number,
    childIndex: number
  ): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + childSlot] = childIndex;
  }

  getChildIndex(nodeIndex: number, childSlot: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + childSlot];
  }

  setChildCount(nodeIndex: number, count: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + NodeIntIndex.CHILD_COUNT] = count;
  }

  getChildCount(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + NodeIntIndex.CHILD_COUNT];
  }

  setFlags(nodeIndex: number, flags: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + NodeIntIndex.FLAGS] = flags;
  }

  getFlags(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + NodeIntIndex.FLAGS];
  }
  // New methods for parent/neighbor relationships
  setParent(nodeIndex: number, parentIndex: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + NodeIntIndex.PARENT] = parentIndex;
  }

  getParent(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + NodeIntIndex.PARENT];
  }

  setFace(nodeIndex: number, faceIndex: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + NodeIntIndex.FACE] = faceIndex;
  }

  getFace(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + NodeIntIndex.FACE];
  }

  setNeighbor(
    nodeIndex: number,
    direction: number,
    neighborIndex: number
  ): void {
    const offset = this.getIntOffset(nodeIndex);
    // Left is always first!!!
    this.intBuffer[offset + NodeIntIndex.NEIGHBOR_LEFT + direction] =
      neighborIndex;
  }

  getNeighbor(nodeIndex: number, direction: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + NodeIntIndex.NEIGHBOR_LEFT + direction];
  }
}
