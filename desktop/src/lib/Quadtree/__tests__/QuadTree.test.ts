import { Matrix4, Vector3 } from "three";
import { beforeEach, describe, expect, test } from "vitest";
import { QuadTree } from "../QuadTree";
import { UnifiedNodeBuffer } from "../UnifiedNodeBuffer";

describe("QuadTree", () => {
  let quadTree: QuadTree;
  let nodeBuffer: UnifiedNodeBuffer;

  beforeEach(() => {
    // Create a fresh buffer and quadtree for each test
    nodeBuffer = new UnifiedNodeBuffer(1); // Single tree buffer

    quadTree = new QuadTree({
      localToWorld: new Matrix4(),
      size: 100,
      minNodeSize: 10,
      origin: new Vector3(0, 0, 0),
      comparatorValue: 1.5,
      nodeBuffer: nodeBuffer.createBuffer(0),
    });
  });

  test("should initialize with correct root node", () => {
    const rootInfo = quadTree.getNodeInfo(0);

    expect(rootInfo.childCount).toBe(0);
    expect(rootInfo.level).toBe(0);
    expect(rootInfo.size.x).toBe(200); // 2 * size for full width
    expect(rootInfo.size.y).toBe(200);
  });

  test("should throw error if comparatorValue is <= 0", () => {
    expect(
      () =>
        new QuadTree({
          localToWorld: new Matrix4(),
          size: 100,
          minNodeSize: 10,
          origin: new Vector3(0, 0, 0),
          comparatorValue: 0,
          nodeBuffer: nodeBuffer.createBuffer(0),
        })
    ).toThrow();
  });

  test("should subdivide when point is inserted", () => {
    const insertPoint = new Vector3(0, 0, 0);
    quadTree.insert(insertPoint);

    const rootInfo = quadTree.getNodeInfo(0);
    expect(rootInfo.childCount).toBe(4);
  });

  test("should not subdivide beyond minNodeSize", () => {
    // Insert point that would cause multiple subdivisions
    const insertPoint = new Vector3(0, 0, 0);

    // Insert multiple times to force subdivisions
    for (let i = 0; i < 10; i++) {
      quadTree.insert(insertPoint);
    }

    // Check that no nodes are smaller than minNodeSize
    let allNodesValid = true;
    quadTree.iterateNodes((nodeIndex) => {
      const info = quadTree.getNodeInfo(nodeIndex);
      if (info.size.x < 10) {
        // minNodeSize
        allNodesValid = false;
      }
    });

    expect(allNodesValid).toBe(true);
  });

  test("should correctly set up neighbor relationships after subdivision", () => {
    const insertPoint = new Vector3(0, 0, 0);
    quadTree.insert(insertPoint);

    // Get children of root
    const rootInfo = quadTree.getNodeInfo(0);
    expect(rootInfo.childCount).toBe(4);

    // Check neighbor relationships between siblings
    // these are the indices of the children of the root node
    const bottomLeft = 1; // First child after root
    const bottomRight = 2;
    const topLeft = 3;
    const topRight = 4;

    // Check horizontal neighbors
    expect(quadTree.getNodeNeighbors(bottomLeft)[1]).toBe(bottomRight); // right neighbor
    expect(quadTree.getNodeNeighbors(bottomRight)[0]).toBe(bottomLeft); // left neighbor
    expect(quadTree.getNodeNeighbors(topLeft)[1]).toBe(topRight); // right neighbor
    expect(quadTree.getNodeNeighbors(topRight)[0]).toBe(topLeft); // left neighbor

    // Check vertical neighbors
    expect(quadTree.getNodeNeighbors(bottomLeft)[2]).toBe(topLeft); // top neighbor
    expect(quadTree.getNodeNeighbors(bottomRight)[2]).toBe(topRight); // top neighbor
    expect(quadTree.getNodeNeighbors(topLeft)[3]).toBe(bottomLeft); // bottom neighbor
    expect(quadTree.getNodeNeighbors(topRight)[3]).toBe(bottomRight); // bottom neighbor
  });

  test("should correctly set up neighbor relationships after recursive subdivisions", () => {
    // Test multiple levels of subdivision
    const testPoints = [
      new Vector3(25, 25, 0), // Level 1 subdivision
      new Vector3(-25, -25, 0), // Level 1 subdivision
      new Vector3(35, 35, 0), // Level 2 subdivision
      new Vector3(-35, -35, 0), // Level 2 subdivision
    ];

    // Insert points one by one and verify subdivisions at each step
    testPoints.forEach((point, index) => {
      quadTree.insert(point);

      // Verify root always has 4 children after first subdivision
      const rootInfo = quadTree.getNodeInfo(0);
      expect(rootInfo.childCount).toBe(4);

      // Get bottom left and right nodes
      const bottomLeft = 1;
      const bottomRight = 2;

      // After first two insertions, verify level 1 subdivisions
      if (index >= 1) {
        expect(quadTree.getNodeInfo(bottomLeft).childCount).toBe(4);
        expect(quadTree.getNodeInfo(bottomRight).childCount).toBe(4);

        // Verify neighbor relationships between level 1 children
        const bl_children = {
          bottomLeft: 5,
          bottomRight: 6,
          topLeft: 7,
          topRight: 8,
        };

        const br_children = {
          bottomLeft: 9,
          bottomRight: 10,
          topLeft: 11,
          topRight: 12,
        };

        // Check internal neighbors in bottom left quadrant
        expect(quadTree.getNodeNeighbors(bl_children.bottomLeft)[1]).toBe(
          bl_children.bottomRight
        );
        expect(quadTree.getNodeNeighbors(bl_children.bottomLeft)[2]).toBe(
          bl_children.topLeft
        );
        expect(quadTree.getNodeNeighbors(bl_children.topRight)[0]).toBe(
          bl_children.topLeft
        );
        expect(quadTree.getNodeNeighbors(bl_children.topRight)[3]).toBe(
          bl_children.bottomRight
        );

        // Check internal neighbors in bottom right quadrant
        expect(quadTree.getNodeNeighbors(br_children.bottomLeft)[1]).toBe(
          br_children.bottomRight
        );
        expect(quadTree.getNodeNeighbors(br_children.bottomLeft)[2]).toBe(
          br_children.topLeft
        );
        expect(quadTree.getNodeNeighbors(br_children.topRight)[0]).toBe(
          br_children.topLeft
        );
        expect(quadTree.getNodeNeighbors(br_children.topRight)[3]).toBe(
          br_children.bottomRight
        );

        // Check neighbors between quadrants
        expect(quadTree.getNodeNeighbors(bl_children.bottomRight)[1]).toBe(
          br_children.bottomLeft
        );
        expect(quadTree.getNodeNeighbors(bl_children.topRight)[1]).toBe(
          br_children.topLeft
        );
        expect(quadTree.getNodeNeighbors(br_children.bottomLeft)[0]).toBe(
          bl_children.bottomRight
        );
        expect(quadTree.getNodeNeighbors(br_children.topLeft)[0]).toBe(
          bl_children.topRight
        );
      }

      // After second level subdivisions, verify level 2
      if (index >= 3) {
        // Verify some level 2 nodes have been subdivided
        const level2Nodes = [5, 6, 9, 10];
        level2Nodes.forEach((nodeIndex) => {
          expect(quadTree.getNodeInfo(nodeIndex).childCount).toBe(4);
        });
      }
    });
  });

  test("should find closest node to point", () => {
    // Insert some points to create a subdivided tree
    quadTree.insert(new Vector3(50, 50, 0));

    const testPoint = new Vector3(45, 45, 0);
    const result = quadTree.findClosestNode(testPoint);

    expect(result.nodeIndex).toBeDefined();
    expect(result.distance).toBeDefined();
    expect(result.distance).toBeGreaterThan(0);
  });

  test("should generate correct level statistics", () => {
    // Create a simple subdivided tree
    quadTree.insert(new Vector3(0, 0, 0));

    const stats = quadTree.getNodeLevelStatistics();

    expect(stats.length).toBeGreaterThan(0);
    expect(stats[0].level).toBe(0); // Root level
    expect(stats[0].nodeCount).toBe(1); // Root node
    expect(stats[1].level).toBe(1); // First subdivision level
    expect(stats[1].nodeCount).toBe(4); // Four children
  });

  test("should reset tree state", () => {
    // First create some subdivisions
    quadTree.insert(new Vector3(0, 0, 0));

    // Get initial state
    const initialStats = quadTree.getTreeSummary();
    expect(initialStats.totalNodes).toBeGreaterThan(1);

    // Reset the tree
    quadTree.reset();

    // Check post-reset state
    const rootInfo = quadTree.getNodeInfo(0);
    expect(rootInfo.childCount).toBe(0);
    expect(rootInfo.level).toBe(0);

    const finalStats = quadTree.getTreeSummary();
    expect(finalStats.totalNodes).toBe(1); // Only root node should remain
  });

  test("should correctly calculate node levels", () => {
    quadTree.insert(new Vector3(0, 0, 0));

    // Root should be level 0
    expect(quadTree.getNodeLevel(0)).toBe(0);

    // First children should be level 1
    for (let i = 1; i <= 4; i++) {
      expect(quadTree.getNodeLevel(i)).toBe(1);
    }
  });

  test("should provide accurate tree summary", () => {
    quadTree.insert(new Vector3(0, 0, 0));

    const summary = quadTree.getTreeSummary();

    expect(summary.totalNodes).toBe(21); // Root + 4 children
    expect(summary.subdivisionLevels).toBe(3); // Levels: 0 (200) and 1 (100) and 2 (50)
    expect(summary.stats).toHaveLength(3);
  });
});

describe("QuadTree node count calculations", () => {
  test("correctly calculates expected node counts", () => {
    expect(QuadTree.getExpectedNodeCount(0)).toBe(1); // Just root
    expect(QuadTree.getExpectedNodeCount(1)).toBe(5); // Root + 4 children
    expect(QuadTree.getExpectedNodeCount(2)).toBe(21); // Root + 4 + 16
    expect(QuadTree.getExpectedNodeCount(3)).toBe(85); // Root + 4 + 16 + 64
  });

  test("correctly calculates nodes at specific levels", () => {
    expect(QuadTree.getNodesAtLevel(0)).toBe(1); // Root level
    expect(QuadTree.getNodesAtLevel(1)).toBe(4); // First subdivision
    expect(QuadTree.getNodesAtLevel(2)).toBe(16); // Second subdivision
    expect(QuadTree.getNodesAtLevel(3)).toBe(64); // Third subdivision
  });
});
