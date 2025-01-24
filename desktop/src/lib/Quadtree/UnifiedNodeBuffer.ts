import {
  MAX_NODES_PER_TREE,
  NODE_FLOAT_COUNT,
  NODE_INT_COUNT,
} from "./constants";
import { NodeBufferSlice } from "./NodeBufferSlice";

export class UnifiedNodeBuffer {
  readonly floatBuffer: Float32Array;
  readonly intBuffer: Int32Array;
  private readonly maxNodesPerTree: number;
  private readonly totalTrees: number;

  constructor(
    totalTrees: number,
    maxNodesPerTree: number = MAX_NODES_PER_TREE
  ) {
    this.totalTrees = totalTrees;
    this.maxNodesPerTree = maxNodesPerTree;

    const totalNodes = totalTrees * maxNodesPerTree;

    // Log buffer allocation for debugging
    console.log(`Allocating buffers for ${totalNodes} total nodes`);

    const floatMemory = new ArrayBuffer(
      totalNodes * NODE_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT
    );
    const intMemory = new ArrayBuffer(
      totalNodes * NODE_INT_COUNT * Int32Array.BYTES_PER_ELEMENT
    );

    this.floatBuffer = new Float32Array(floatMemory);
    this.intBuffer = new Int32Array(intMemory);

    // Log buffer sizes for debugging
    console.log(`Float buffer length: ${this.floatBuffer.length}`);
    console.log(`Int buffer length: ${this.intBuffer.length}`);
  }

  createBuffer(treeIndex: number): NodeBufferSlice {
    if (treeIndex >= this.totalTrees) {
      throw new Error(
        `Tree index ${treeIndex} exceeds maximum trees ${this.totalTrees}`
      );
    }

    const startIndex = treeIndex * this.maxNodesPerTree;
    return new NodeBufferSlice(
      this.floatBuffer,
      this.intBuffer,
      startIndex,
      this.maxNodesPerTree
    );
  }

  reset(): void {
    this.floatBuffer.fill(0);
    this.intBuffer.fill(0);
  }
}
