import { Box3, Vector3 } from "three";
import { beforeEach, describe, expect, test } from "vitest";
import { UnifiedNodeBuffer } from "../UnifiedNodeBuffer";
import { NodeIntIndex } from "../constants";

describe("UnifiedNodeBuffer and NodeBufferSlice", () => {
  let unifiedBuffer: UnifiedNodeBuffer;

  beforeEach(() => {
    unifiedBuffer = new UnifiedNodeBuffer(2); // Create buffer for 2 trees
  });

  test("should create buffer slices correctly", () => {
    const slice1 = unifiedBuffer.createBufferSlice(0);
    const slice2 = unifiedBuffer.createBufferSlice(1);

    expect(slice1.startIndex).toBe(0);
    expect(slice2.startIndex).toBe(3000); // MAX_NODES_PER_TREE
    expect(() => unifiedBuffer.createBufferSlice(2)).toThrow(); // Should throw for invalid index
  });

  test("should handle node allocation and basic properties", () => {
    const slice = unifiedBuffer.createBufferSlice(0);
    const nodeIndex = slice.allocateNode();

    expect(nodeIndex).toBe(1); // First allocated node is 1 since 0 is root
    expect(slice.size).toBe(2); // Size is 2 because of root node + allocated node

    // Test node initialization
    expect(slice.getChildCount(nodeIndex)).toBe(0);
    expect(slice.getChildIndex(nodeIndex, NodeIntIndex.CHILD_BOTTOM_LEFT)).toBe(
      -1
    );
    expect(slice.getFlags(nodeIndex)).toBe(0);
    expect(slice.getParent(nodeIndex)).toBe(-1);
    expect(slice.getFace(nodeIndex)).toBe(-1);
  });

  test("should handle vector operations correctly", () => {
    const slice = unifiedBuffer.createBufferSlice(0);
    const nodeIndex = slice.allocateNode();

    const center = new Vector3(1, 2, 3);
    slice.setCenter(nodeIndex, center);

    const retrievedCenter = new Vector3();
    slice.getCenter(nodeIndex, retrievedCenter);

    expect(retrievedCenter.x).toBe(1);
    expect(retrievedCenter.y).toBe(2);
    expect(retrievedCenter.z).toBe(3);
  });

  test("should handle bounds operations", () => {
    const slice = unifiedBuffer.createBufferSlice(0);
    const nodeIndex = slice.allocateNode();

    const bounds = new Box3();
    bounds.min.set(-1, -1, -1);
    bounds.max.set(1, 1, 1);

    slice.setBounds(nodeIndex, bounds);

    const retrievedBounds = new Box3();
    slice.getBounds(nodeIndex, retrievedBounds);

    expect(retrievedBounds.min.x).toBe(-1);
    expect(retrievedBounds.max.x).toBe(1);
  });

  test("should handle neighbor relationships", () => {
    const slice = unifiedBuffer.createBufferSlice(0);
    const node1 = slice.allocateNode();
    const node2 = slice.allocateNode();

    slice.setNeighbor(
      node1,
      NodeIntIndex.NEIGHBOR_LEFT - NodeIntIndex.NEIGHBOR_LEFT,
      node2
    );

    expect(
      slice.getNeighbor(
        node1,
        NodeIntIndex.NEIGHBOR_LEFT - NodeIntIndex.NEIGHBOR_LEFT
      )
    ).toBe(node2);
  });

  test("should handle reset operations", () => {
    const slice = unifiedBuffer.createBufferSlice(0);
    const nodeIndex = slice.allocateNode();

    slice.setCenter(nodeIndex, new Vector3(1, 1, 1));
    slice.reset();

    const retrievedCenter = new Vector3();
    slice.getCenter(nodeIndex, retrievedCenter);

    expect(retrievedCenter.x).toBe(0);
    expect(retrievedCenter.y).toBe(0);
    expect(retrievedCenter.z).toBe(0);
    expect(slice.size).toBe(0);
  });

  test("should handle maximum node limit", () => {
    const smallBuffer = new UnifiedNodeBuffer(1, 3); // Allow 3 nodes (root + 2)
    const slice = smallBuffer.createBufferSlice(0);

    slice.allocateNode(); // First node after root
    slice.allocateNode(); // Second node after root

    expect(() => slice.allocateNode()).toThrowError(); // Should throw on fourth node (including root)
  });

  test("should handle iteration", () => {
    const slice = unifiedBuffer.createBufferSlice(0);
    const iterations: number[] = [];

    // Create nodes (remember we start with root node)
    slice.allocateNode(); // node 1
    slice.allocateNode(); // node 2

    slice.iterate((nodeIndex) => {
      iterations.push(nodeIndex);
    });

    expect(iterations).toEqual([0, 1, 2]); // Root (0) + two allocated nodes
  });
});
