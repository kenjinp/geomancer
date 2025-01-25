import {
  ChildIndex,
  Direction,
  FloatBufferOffsets,
  IntBufferOffsets,
  QuadtreeConstants,
} from "./constants";
import { NodeBufferConfig } from "./types";

export class UnifiedNodeBuffer {
  private floatBuffer: Float32Array;
  private intBuffer: Int32Array;
  private nodeCount: number = 0;
  private readonly maxNodes: number;

  constructor(config: NodeBufferConfig) {
    this.maxNodes = config.maxNodes;
    this.floatBuffer = new Float32Array(
      config.maxNodes * FloatBufferOffsets.FLOAT_VALUES_PER_NODE
    );
    this.intBuffer = new Int32Array(
      config.maxNodes * IntBufferOffsets.INT_VALUES_PER_NODE
    );
    this.initializeBuffers();
  }

  private initializeBuffers(): void {
    this.intBuffer.fill(QuadtreeConstants.INVALID_INDEX);
    this.floatBuffer.fill(0);
  }

  public allocateNode(): number {
    if (this.nodeCount >= this.maxNodes) {
      throw new Error(`Maximum node capacity (${this.maxNodes}) reached`);
    }
    return this.nodeCount++;
  }

  // Direct buffer access methods to avoid object creation
  public getX(index: number): number {
    return this.floatBuffer[
      index * FloatBufferOffsets.FLOAT_VALUES_PER_NODE + FloatBufferOffsets.X
    ];
  }

  public getY(index: number): number {
    return this.floatBuffer[
      index * FloatBufferOffsets.FLOAT_VALUES_PER_NODE + FloatBufferOffsets.Y
    ];
  }

  public getSize(index: number): number {
    return this.floatBuffer[
      index * FloatBufferOffsets.FLOAT_VALUES_PER_NODE + FloatBufferOffsets.SIZE
    ];
  }

  public getLevel(index: number): number {
    return this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE + IntBufferOffsets.LEVEL
    ];
  }

  public getChildIndices(index: number): number[] {
    return [
      this.intBuffer[
        index * IntBufferOffsets.INT_VALUES_PER_NODE +
          IntBufferOffsets.CHILD_INDEX_TL
      ],
      this.intBuffer[
        index * IntBufferOffsets.INT_VALUES_PER_NODE +
          IntBufferOffsets.CHILD_INDEX_TR
      ],
      this.intBuffer[
        index * IntBufferOffsets.INT_VALUES_PER_NODE +
          IntBufferOffsets.CHILD_INDEX_BL
      ],
      this.intBuffer[
        index * IntBufferOffsets.INT_VALUES_PER_NODE +
          IntBufferOffsets.CHILD_INDEX_BR
      ],
    ];
  }

  public getFaceIndex(index: number): number {
    return this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE + IntBufferOffsets.FACE_INDEX
    ];
  }

  public getHasChildren(index: number): boolean {
    return Boolean(
      this.intBuffer[
        index * IntBufferOffsets.INT_VALUES_PER_NODE +
          IntBufferOffsets.HAS_CHILDREN
      ]
    );
  }

  public getNeighbor(index: number, direction: Direction): number {
    return this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE + direction
    ];
  }

  // Direct buffer setters
  public setX(index: number, value: number): void {
    this.floatBuffer[
      index * FloatBufferOffsets.FLOAT_VALUES_PER_NODE + FloatBufferOffsets.X
    ] = value;
  }

  public setY(index: number, value: number): void {
    this.floatBuffer[
      index * FloatBufferOffsets.FLOAT_VALUES_PER_NODE + FloatBufferOffsets.Y
    ] = value;
  }

  public setSize(index: number, value: number): void {
    this.floatBuffer[
      index * FloatBufferOffsets.FLOAT_VALUES_PER_NODE + FloatBufferOffsets.SIZE
    ] = value;
  }

  public setLevel(index: number, value: number): void {
    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE + IntBufferOffsets.LEVEL
    ] = value;
  }

  public setChildIndices(index: number, childIndices: number[]): void {
    if (childIndices.length !== QuadtreeConstants.CHILD_COUNT) {
      throw new Error("Must provide exactly 4 child indices");
    }

    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE +
        IntBufferOffsets.CHILD_INDEX_TL
    ] = childIndices[0];
    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE +
        IntBufferOffsets.CHILD_INDEX_TR
    ] = childIndices[1];
    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE +
        IntBufferOffsets.CHILD_INDEX_BL
    ] = childIndices[2];
    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE +
        IntBufferOffsets.CHILD_INDEX_BR
    ] = childIndices[3];
  }

  public setFaceIndex(index: number, value: number): void {
    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE + IntBufferOffsets.FACE_INDEX
    ] = value;
  }

  public setHasChildren(index: number, value: boolean): void {
    this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE +
        IntBufferOffsets.HAS_CHILDREN
    ] = Number(value);
  }

  public setNeighbor(index: number, direction: Direction, value: number): void {
    this.intBuffer[index * IntBufferOffsets.INT_VALUES_PER_NODE + direction] =
      value;
  }

  public reset(): void {
    this.nodeCount = 0;
    this.initializeBuffers();
  }

  public getNodeCount(): number {
    return this.nodeCount;
  }

  public getMaxNodes(): number {
    return this.maxNodes;
  }

  public getChildIndex(index: number, childPosition: ChildIndex): number {
    const offset = IntBufferOffsets.CHILD_INDEX_TL + childPosition;
    return this.intBuffer[
      index * IntBufferOffsets.INT_VALUES_PER_NODE + offset
    ];
  }

  public setChildIndex(
    index: number,
    childPosition: ChildIndex,
    value: number
  ): void {
    const offset = IntBufferOffsets.CHILD_INDEX_TL + childPosition;
    this.intBuffer[index * IntBufferOffsets.INT_VALUES_PER_NODE + offset] =
      value;
  }
}
