import { Vector3 } from "three";
import { beforeEach, describe, expect, test } from "vitest";
import { FaceQuadtree } from "../FaceQuadtree";
import { UnifiedNodeBuffer } from "../UnifiedNodeBuffer";
import { ChildIndex, Direction, QuadtreeConstants } from "../constants";
import { CubeFace } from "../types";

describe("FaceQuadtree", () => {
  let buffer: UnifiedNodeBuffer;
  let quadtree: FaceQuadtree;

  beforeEach(() => {
    buffer = new UnifiedNodeBuffer({
      maxNodes: 100,
      radius: 1,
      minDistanceThreshold: 0.1,
    });
    quadtree = new FaceQuadtree(buffer, CubeFace.FRONT, 1, 0.1);
  });

  test("should create root node with correct initial values", () => {
    expect(buffer.getNodeCount()).toBe(1); // Root node created
    expect(buffer.getX(0)).toBe(0);
    expect(buffer.getY(0)).toBe(0);
    expect(buffer.getLevel(0)).toBe(QuadtreeConstants.ROOT_LEVEL);
    expect(buffer.getSize(0)).toBe(QuadtreeConstants.ROOT_SIZE);
    expect(buffer.getChildIndex(0, ChildIndex.TOP_LEFT)).toBe(
      QuadtreeConstants.INVALID_INDEX
    );
    expect(buffer.getFaceIndex(0)).toBe(CubeFace.FRONT);
    expect(buffer.getHasChildren(0)).toBe(false);
  });

  test("should correctly subdivide node and set child indices", () => {
    // Insert point to trigger subdivision
    quadtree.insert(new Vector3(0, 0, 1));

    // Root should now have children
    expect(buffer.getHasChildren(0)).toBe(true);
    const firstChildIndex = buffer.getChildIndex(0, ChildIndex.TOP_LEFT);
    expect(firstChildIndex).toBe(1); // Should be the second node in buffer

    // Verify all four children were created
    const childIndices = buffer.getChildIndices(0);
    for (let i = 0; i < QuadtreeConstants.CHILD_COUNT; i++) {
      const childIndex = childIndices[i];
      expect(buffer.getLevel(childIndex)).toBe(1);
      expect(buffer.getSize(childIndex)).toBe(0.5); // Half of parent size
    }
  });

  test("should correctly set neighbor relationships after subdivision", () => {
    quadtree.insert(new Vector3(0, 0, 1));

    const childIndices = buffer.getChildIndices(0);

    // TOP_LEFT child should connect to TOP_RIGHT and BOTTOM_LEFT
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.TOP_LEFT], Direction.EAST)
    ).toBe(childIndices[ChildIndex.TOP_RIGHT]);
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.TOP_LEFT], Direction.SOUTH)
    ).toBe(childIndices[ChildIndex.BOTTOM_LEFT]);

    // TOP_RIGHT child should connect to TOP_LEFT and BOTTOM_RIGHT
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.TOP_RIGHT], Direction.WEST)
    ).toBe(childIndices[ChildIndex.TOP_LEFT]);
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.TOP_RIGHT], Direction.SOUTH)
    ).toBe(childIndices[ChildIndex.BOTTOM_RIGHT]);

    // BOTTOM_LEFT child should connect to BOTTOM_RIGHT and TOP_LEFT
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.BOTTOM_LEFT], Direction.EAST)
    ).toBe(childIndices[ChildIndex.BOTTOM_RIGHT]);
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.BOTTOM_LEFT], Direction.NORTH)
    ).toBe(childIndices[ChildIndex.TOP_LEFT]);

    // BOTTOM_RIGHT child should connect to BOTTOM_LEFT and TOP_RIGHT
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.BOTTOM_RIGHT], Direction.WEST)
    ).toBe(childIndices[ChildIndex.BOTTOM_LEFT]);
    expect(
      buffer.getNeighbor(childIndices[ChildIndex.BOTTOM_RIGHT], Direction.NORTH)
    ).toBe(childIndices[ChildIndex.TOP_RIGHT]);
  });

  test("should subdivide based on distance threshold", () => {
    const point1 = new Vector3(0, 0, 1).normalize();
    const point2 = new Vector3(0.1, 0.1, 1).normalize();

    quadtree.insert(point1);
    quadtree.insert(point2);

    // Should have subdivided due to close points
    expect(buffer.getHasChildren(0)).toBe(true);

    const farPoint = new Vector3(0.9, 0.9, 1).normalize();
    const firstChildIndex = buffer.getChildIndex(0, ChildIndex.TOP_LEFT);
    const topRightChild = firstChildIndex + ChildIndex.TOP_RIGHT;

    quadtree.insert(farPoint);

    // Far point shouldn't cause further subdivision
    expect(buffer.getHasChildren(topRightChild)).toBe(false);
  });
});
