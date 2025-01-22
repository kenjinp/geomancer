import { Box3, Vector3 } from "three";

// Constants for memory layout
const FLOAT_SIZE = 4;
const NODE_FLOAT_COUNT = 15; // 3 for center, 3 for sphereCenter, 3 for size, 6 for bounds
const NODE_INT_COUNT = 11; // 4 for child indices, 1 for childCount, 1 for flags, 1 for parent, 4 for neighbors
const MAX_NODES = 10_000;

export class NodeBuffer {
  private floatBuffer: Float32Array;
  private intBuffer: Int32Array;
  private nodeCount: number = 1;

  constructor() {
    const floatMemory = new ArrayBuffer(
      MAX_NODES * NODE_FLOAT_COUNT * FLOAT_SIZE
    );
    const intMemory = new ArrayBuffer(MAX_NODES * NODE_INT_COUNT * 4);

    this.floatBuffer = new Float32Array(floatMemory);
    this.intBuffer = new Int32Array(intMemory);
  }

  get size(): number {
    return this.nodeCount;
  }

  iterate = (callback: (index: number) => void): void => {
    for (let i = 0; i < this.nodeCount; i++) {
      callback(i);
    }
  };

  createNode(index: number): void {
    this.setChildCount(index, 0);
    this.setFlags(index, 0);
    this.setParent(index, -1);
    // Initialize neighbors to -1 (no neighbor)
    for (let i = 0; i < 4; i++) {
      this.setNeighbor(index, i, -1);
    }
  }

  reset(): void {
    // Reset buffers to initial state
    this.floatBuffer.fill(0);
    this.intBuffer.fill(0);

    // Reset node count back to 1 (root node)
    this.nodeCount = 1;
  }

  allocateNode(): number {
    const index = this.nodeCount++;
    if (index >= MAX_NODES) {
      throw new Error("Maximum node count exceeded");
    }
    this.createNode(index);
    return index;
  }

  private getFloatOffset(nodeIndex: number): number {
    return nodeIndex * NODE_FLOAT_COUNT;
  }

  private getIntOffset(nodeIndex: number): number {
    return nodeIndex * NODE_INT_COUNT;
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

  setNeighbor(
    nodeIndex: number,
    direction: number,
    neighborIndex: number
  ): void {
    const offset = this.getIntOffset(nodeIndex);
    this.intBuffer[offset + 7 + direction] = neighborIndex;
  }

  getNeighbor(nodeIndex: number, direction: number): number {
    const offset = this.getIntOffset(nodeIndex);
    return this.intBuffer[offset + 7 + direction];
  }
}
