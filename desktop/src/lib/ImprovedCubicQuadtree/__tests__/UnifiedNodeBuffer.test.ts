import { beforeEach, describe, expect, test } from "vitest";
import { UnifiedNodeBuffer } from "../UnifiedNodeBuffer";
import { ChildIndex, Direction } from "../constants";

describe("UnifiedNodeBuffer", () => {
  let buffer: UnifiedNodeBuffer;

  beforeEach(() => {
    buffer = new UnifiedNodeBuffer({
      maxNodes: 100,
      radius: 1,
      minDistanceThreshold: 0.1,
    });
  });

  test("should allocate nodes sequentially", () => {
    const index1 = buffer.allocateNode();
    const index2 = buffer.allocateNode();

    expect(index1).toBe(0);
    expect(index2).toBe(1);
  });

  test("should throw when exceeding maxNodes", () => {
    const smallBuffer = new UnifiedNodeBuffer({
      maxNodes: 2,
      radius: 1,
      minDistanceThreshold: 0.1,
    });

    smallBuffer.allocateNode();
    smallBuffer.allocateNode();

    expect(() => smallBuffer.allocateNode()).toThrow();
  });

  test("should correctly store and retrieve float values", () => {
    const index = buffer.allocateNode();

    buffer.setX(index, 1.5);
    buffer.setY(index, 2.5);
    buffer.setSize(index, 0.5);

    expect(buffer.getX(index)).toBe(1.5);
    expect(buffer.getY(index)).toBe(2.5);
    expect(buffer.getSize(index)).toBe(0.5);
  });

  test("should correctly store and retrieve integer values", () => {
    const index = buffer.allocateNode();

    buffer.setLevel(index, 2);
    buffer.setChildIndex(index, ChildIndex.TOP_LEFT, 4);
    buffer.setFaceIndex(index, 1);
    buffer.setHasChildren(index, true);

    expect(buffer.getLevel(index)).toBe(2);
    expect(buffer.getChildIndex(index, ChildIndex.TOP_LEFT)).toBe(4);
    expect(buffer.getFaceIndex(index)).toBe(1);
    expect(buffer.getHasChildren(index)).toBe(true);
  });

  test("should correctly handle neighbor relationships", () => {
    const index = buffer.allocateNode();

    buffer.setNeighbor(index, Direction.NORTH, 1);
    buffer.setNeighbor(index, Direction.SOUTH, 2);
    buffer.setNeighbor(index, Direction.EAST, 3);
    buffer.setNeighbor(index, Direction.WEST, 4);

    expect(buffer.getNeighbor(index, Direction.NORTH)).toBe(1);
    expect(buffer.getNeighbor(index, Direction.SOUTH)).toBe(2);
    expect(buffer.getNeighbor(index, Direction.EAST)).toBe(3);
    expect(buffer.getNeighbor(index, Direction.WEST)).toBe(4);
  });

  test("should reset buffer state", () => {
    const index = buffer.allocateNode();
    buffer.setX(index, 1.5);
    buffer.setNeighbor(index, Direction.NORTH, 1);

    buffer.reset();

    expect(buffer.getNodeCount()).toBe(0);
    const newIndex = buffer.allocateNode();
    expect(newIndex).toBe(0);
  });
});
