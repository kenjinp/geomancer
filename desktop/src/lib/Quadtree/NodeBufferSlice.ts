import { Box3, Vector3 } from "three";
import { NODE_FLOAT_COUNT, NODE_INT_COUNT } from "./constants";

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
    this.setFlags(index, 0);
    this.setParent(index, -1);
    this.setFace(index, -1); // unset for now//
    // Initialize neighbors to -1 (no neighbor)
    this.setNeighbor(index, 0, -1);
    this.setNeighbor(index, 1, -1);
    this.setNeighbor(index, 2, -1);
    this.setNeighbor(index, 3, -1);
  }

  reset(): void {
    // Reset buffers to initial state
    const floatStart = this.startIndex * NODE_FLOAT_COUNT;
    const floatEnd = floatStart + this.maxNodes * NODE_FLOAT_COUNT;
    const intStart = this.startIndex * NODE_INT_COUNT;
    const intEnd = intStart + this.maxNodes * NODE_INT_COUNT;

    this.floatBuffer.fill(0, floatStart, floatEnd);
    this.intBuffer.fill(0, intStart, intEnd);

    // Reset node count to 1 (root node)
    this.nodeCount = 0;

    // Initialize root node
    // this.createNode(0);
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
    // const absoluteIndex = this.startIndex + size;
    this.createNode(index);
    return index;
  }

  setCenter(nodeIndex: number, center: Vector3): void {
    const offset = this.getFloatOffset(nodeIndex);
    this.floatBuffer[offset] = center.x;
    this.floatBuffer[offset + 1] = center.y;
    this.floatBuffer[offset + 2] = center.z;
  }

  getCenter(nodeIndex: number, target: Vector3): Vector3 {
    const offset = this.getFloatOffset(nodeIndex);
    return target.set(
      this.floatBuffer[offset],
      this.floatBuffer[offset + 1],
      this.floatBuffer[offset + 2]
    );
  }

  setSphereCenter(nodeIndex: number, center: Vector3): void {
    const offset = this.getFloatOffset(nodeIndex) + 3;
    this.floatBuffer[offset] = center.x;
    this.floatBuffer[offset + 1] = center.y;
    this.floatBuffer[offset + 2] = center.z;
  }

  getSphereCenter(nodeIndex: number, target: Vector3): Vector3 {
    const offset = this.getFloatOffset(nodeIndex) + 3;
    return target.set(
      this.floatBuffer[offset],
      this.floatBuffer[offset + 1],
      this.floatBuffer[offset + 2]
    );
  }

  setSize(nodeIndex: number, size: Vector3): void {
    const offset = this.getFloatOffset(nodeIndex) + 6;
    this.floatBuffer[offset] = size.x;
    this.floatBuffer[offset + 1] = size.y;
    this.floatBuffer[offset + 2] = size.z;
  }

  getSize(nodeIndex: number, target: Vector3): Vector3 {
    const offset = this.getFloatOffset(nodeIndex) + 6;
    return target.set(
      this.floatBuffer[offset],
      this.floatBuffer[offset + 1],
      this.floatBuffer[offset + 2]
    );
  }

  setBounds(nodeIndex: number, bounds: Box3): void {
    const offset = this.getFloatOffset(nodeIndex) + 9;
    this.floatBuffer[offset] = bounds.min.x;
    this.floatBuffer[offset + 1] = bounds.min.y;
    this.floatBuffer[offset + 2] = bounds.min.z;
    this.floatBuffer[offset + 3] = bounds.max.x;
    this.floatBuffer[offset + 4] = bounds.max.y;
    this.floatBuffer[offset + 5] = bounds.max.z;
  }

  getBounds(nodeIndex: number, target: Box3): Box3 {
    const offset = this.getFloatOffset(nodeIndex) + 9;
    target.min.set(
      this.floatBuffer[offset],
      this.floatBuffer[offset + 1],
      this.floatBuffer[offset + 2]
    );
    target.max.set(
      this.floatBuffer[offset + 3],
      this.floatBuffer[offset + 4],
      this.floatBuffer[offset + 5]
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
    this.intBuffer[offset + 4] = count;
  }

  getChildCount(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + 4];
  }

  setFlags(nodeIndex: number, flags: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + 5] = flags;
  }

  getFlags(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + 5];
  }
  // New methods for parent/neighbor relationships
  setParent(nodeIndex: number, parentIndex: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + 6] = parentIndex;
  }

  getParent(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + 6];
  }

  setFace(nodeIndex: number, faceIndex: number): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + 7] = faceIndex;
  }

  getFace(nodeIndex: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + 7];
  }

  setNeighbor(
    nodeIndex: number,
    direction: number,
    neighborIndex: number
  ): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + 8 + direction] = neighborIndex;
  }

  getNeighbor(nodeIndex: number, direction: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + 8 + direction];
  }
}
