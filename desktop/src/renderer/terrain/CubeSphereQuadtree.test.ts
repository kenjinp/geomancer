import * as THREE from "three";
import { beforeEach, describe, expect, test } from "vitest";
import { CubeSphereQuadtree, FaceIndex } from "./CubeSphereQuadtree";

// Add this interface declaration at the top of the test file to access private methods
interface TestCubeSphereQuadtree extends CubeSphereQuadtree {
  splitNode: (index: number) => void;
  updateNodeLOD: (
    index: number,
    cameraPos: THREE.Vector3,
    radius: number,
    offset: THREE.Vector3,
    maxDepth: number,
    threshold: number
  ) => void;
}

describe("CubeSphereQuadtree", () => {
  let quadtree: CubeSphereQuadtree;

  beforeEach(() => {
    quadtree = new CubeSphereQuadtree();
  });

  test("should initialize with 6 root nodes", () => {
    expect(quadtree["indexMap"].size).toBe(6);
    for (let face = 0; face < 6; face++) {
      expect(quadtree["indexMap"].has(`${face}:0:0:0`)).toBe(true);
    }
  });

  test("cubeToSphere projection for front face", () => {
    const pos = quadtree["cubeToSphere"](0, 0, 0, 0);
    expect(pos).toEqual(new Float32Array([0, 0, 1]));
  });

  test("cubeToSphere projection for right face", () => {
    const pos = quadtree["cubeToSphere"](2, 0, 0, 0);
    const expected = new THREE.Vector3(1, 0, 0).normalize();
    expect(pos[0]).toBeCloseTo(expected.x);
    expect(pos[1]).toBeCloseTo(expected.y);
    expect(pos[2]).toBeCloseTo(expected.z);
  });

  test("neighbor resolution within same face", () => {
    const quadtree =
      new CubeSphereQuadtree() as unknown as TestCubeSphereQuadtree;
    const rootIndex = quadtree["indexMap"].get("0:0:0:0")!;
    const node = quadtree["getNodeView"](rootIndex);

    // Split node to create children
    quadtree.splitNode(rootIndex);
    const children = node.children;

    // Test right neighbor of first child
    const childNode = quadtree["getNodeView"](children[0]);
    const neighborIndex = childNode.neighbors[1]; // right neighbor
    expect(neighborIndex).toBe(children[1]);
  });

  test("cross-face neighbor resolution", () => {
    const face0Root = quadtree["indexMap"].get("0:0:0:0")!;
    const face2Root = quadtree["indexMap"].get("2:0:0:0")!;

    // Split both faces' root nodes
    quadtree.splitNode(face0Root);
    quadtree.splitNode(face2Root);

    // Verify face 2 has children
    const face2Children = quadtree["getNodeView"](face2Root).children;
    expect(face2Children.every((i) => i !== -1)).toBe(true);

    // Get rightmost child of face 0
    const face0Children = quadtree["getNodeView"](face0Root).children;
    const rightmostChild = quadtree["getNodeView"](face0Children[1]);

    // Verify neighbor exists
    const neighborIndex = rightmostChild.neighbors[1];
    expect(neighborIndex).not.toBe(-1);

    const neighbor = quadtree["getNodeView"](neighborIndex);
    expect(neighbor.face).toBe(2);
  });

  test("LOD update triggers subdivision", () => {
    const cameraPos = new THREE.Vector3(1, 0, 0); // Close to face 0
    quadtree.updateLOD(cameraPos);

    const rootIndex = quadtree["indexMap"].get("0:0:0:0")!;
    const rootNode = quadtree["getNodeView"](rootIndex);
    expect(rootNode.children[0]).not.toBe(-1); // Should have children
  });

  test("node retirement system", () => {
    const rootIndex = quadtree["indexMap"].get("0:0:0:0")!;
    quadtree.splitNode(rootIndex);

    const originalChildren = quadtree["getNodeView"](rootIndex).children;
    expect(originalChildren.every((i) => i !== -1)).toBe(true);

    // Move camera far away
    quadtree.updateLOD(new THREE.Vector3(0, 0, 100));
    const updatedChildren = quadtree["getNodeView"](rootIndex).children;
    expect(updatedChildren.every((i) => i === -1)).toBe(true);
  });

  test("memory recycling", () => {
    const face0Root = quadtree["indexMap"].get("0:0:0:0")!;
    const testCameraPos = new THREE.Vector3(0, 0, 100);

    // Only process the root node during LOD updates
    const originalUpdate = quadtree["updateNodeLOD"].bind(quadtree);
    quadtree["updateNodeLOD"] = function (
      index: number,
      cameraPos: THREE.Vector3,
      radius: number,
      offset: THREE.Vector3,
      maxDepth: number,
      threshold: number
    ) {
      if (index === face0Root) {
        originalUpdate(index, cameraPos, radius, offset, maxDepth, threshold);
      }
    };

    quadtree.splitNode(face0Root);
    const children = Array.from(quadtree["getNodeView"](face0Root).children);

    // Trigger retirement with valid camera position
    quadtree.updateLOD(testCameraPos);

    // Reset implementation
    quadtree["updateNodeLOD"] = originalUpdate;

    expect(quadtree["freeIndices"]).toEqual(children);
  });

  test("buffer overflow protection", () => {
    const badTree = new CubeSphereQuadtree();

    // Access MAX_NODES from module scope
    const MAX_NODES = 1_000_000;
    badTree["nextIndex"] = MAX_NODES - 1;

    // Should succeed
    expect(() => badTree["createNode"](0, 0, 0, 0)).not.toThrow();

    // Should fail
    expect(() => badTree["createNode"](0, 0, 0, 0)).toThrowError(
      "CubeSphereQuadtree node buffer overflow"
    );
  });

  test("coordinate rotation transformations", () => {
    const testRotations = (
      face: FaceIndex,
      rotation: number,
      input: [number, number],
      expected: [number, number]
    ) => {
      const [rx, ry] = quadtree["rotateCoordinates"](
        input[0],
        input[1],
        1, // level=1 (maxCoord=1)
        rotation
      );
      expect(rx).toBe(expected[0]);
      expect(ry).toBe(expected[1]);
    };

    // Test all rotation cases with level=1 (maxCoord=1)
    testRotations(0, 0, [0, 0], [0, 0]); // No rotation
    testRotations(0, 1, [0, 1], [1, 1]); // 90° counter-clockwise
    testRotations(0, 2, [1, 1], [0, 0]); // 180°
    testRotations(0, 3, [1, 0], [1, 1]); // 270° counter-clockwise (corrected expectation)
  });

  test("face adjacency configuration", () => {
    const validateFaceEdges = (
      face: FaceIndex,
      expected: Record<string, { face: number; rotation: number }>
    ) => {
      const edges = quadtree["faceAdjacency"].get(face)!;
      expect(Object.fromEntries(edges)).toMatchObject(expected);
    };

    validateFaceEdges(0, {
      // Front
      left: { face: 3, rotation: 0 },
      right: { face: 2, rotation: 0 },
      top: { face: 4, rotation: 1 },
      bottom: { face: 5, rotation: 3 },
    });

    validateFaceEdges(4, {
      // Top
      left: { face: 3, rotation: 3 },
      right: { face: 2, rotation: 1 },
      top: { face: 1, rotation: 2 },
      bottom: { face: 0, rotation: 2 },
    });
  });

  test("multi-level node retirement", () => {
    const face0Root = quadtree["indexMap"].get("0:0:0:0")!;

    // Isolate to single branch
    const originalSplit = quadtree.splitNode.bind(quadtree);
    let currentParent = face0Root;
    quadtree.splitNode = (index: number) => {
      if (index === currentParent) {
        originalSplit(index);
        currentParent = quadtree["getNodeView"](index).children[0];
      }
    };

    // Split 3 levels deep
    quadtree.splitNode(face0Root); // Level 1
    quadtree.splitNode(currentParent); // Level 2
    quadtree.splitNode(currentParent); // Level 3

    // Reset implementation
    quadtree.splitNode = originalSplit;

    // Retire entire hierarchy
    quadtree.updateLOD(new THREE.Vector3(0, 0, 100));

    // 4 (level1) + 4 (level2) + 4 (level3) = 12 indices
    expect(quadtree["freeIndices"].length).toBe(12);
  });

  test("error metric influences LOD", () => {
    const cameraPos = new THREE.Vector3(1, 0, 0);
    const rootIndex = quadtree["indexMap"].get("0:0:0:0")!;

    // Modify error metric directly in buffer
    const nodeOffset = rootIndex * 32 + 16; // errorMetric at index 16
    quadtree["nodeBuffer"][nodeOffset] = 100;

    quadtree.updateLOD(cameraPos);
    expect(quadtree["getNodeView"](rootIndex).children[0]).not.toBe(-1);
  });

  test("maximum depth enforcement", () => {
    const cameraPos = new THREE.Vector3(0.1, 0, 0); // Very close
    const maxDepth = 3;

    quadtree.updateLOD(cameraPos, maxDepth);
    const rootIndex = quadtree["indexMap"].get("0:0:0:0")!;

    let current = rootIndex;
    for (let i = 0; i < maxDepth; i++) {
      current = quadtree["getNodeView"](current).children[0];
      expect(current).not.toBe(-1);
    }

    // Should not split beyond max depth
    expect(quadtree["getNodeView"](current).children[0]).toBe(-1);
  });
});

describe("CubeSphereQuadtree > Node Positions", () => {
  test("root node positions", () => {
    const quadtree = new CubeSphereQuadtree();

    const positions = Array.from({ length: 6 }, (_, face) => {
      const index = quadtree["indexMap"].get(`${face}:0:0:0`)!;
      return quadtree["getNodeView"](index).spherePos;
    });

    // Front (+Z)
    expect(positions[0][0]).toBeCloseTo(0);
    expect(positions[0][1]).toBeCloseTo(0);
    expect(positions[0][2]).toBeCloseTo(1);

    // Back (-Z)
    expect(positions[1][0]).toBeCloseTo(0);
    expect(positions[1][1]).toBeCloseTo(0);
    expect(positions[1][2]).toBeCloseTo(-1);

    // Right (+X)
    expect(positions[2][0]).toBeCloseTo(1);
    expect(positions[2][1]).toBeCloseTo(0);
    expect(positions[2][2]).toBeCloseTo(0);

    // Left (-X)
    expect(positions[3][0]).toBeCloseTo(-1);
    expect(positions[3][1]).toBeCloseTo(0);
    expect(positions[3][2]).toBeCloseTo(0);

    // Top (+Y)
    expect(positions[4][0]).toBeCloseTo(0);
    expect(positions[4][1]).toBeCloseTo(1);
    expect(positions[4][2]).toBeCloseTo(0);

    // Bottom (-Y)
    expect(positions[5][0]).toBeCloseTo(0);
    expect(positions[5][1]).toBeCloseTo(-1);
    expect(positions[5][2]).toBeCloseTo(0);
  });

  test("child node positions", () => {
    const quadtree = new CubeSphereQuadtree();
    const rootIndex = quadtree["indexMap"].get("0:0:0:0")!;
    quadtree.splitNode(rootIndex);

    const children = quadtree["getNodeView"](rootIndex).children;
    const positions = children.map((i) => quadtree["getNodeView"](i).spherePos);

    // Verify 4 child positions on front face
    positions.forEach((pos) => {
      const [x, y, z] = pos;
      const length = Math.sqrt(x ** 2 + y ** 2 + z ** 2);
      expect(length).toBeCloseTo(1);
    });
  });
});
