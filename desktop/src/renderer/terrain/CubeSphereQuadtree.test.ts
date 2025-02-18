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

describe.skip("CubeSphereQuadtree", () => {
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
    for (let i = 0; i <= maxDepth; i++) {
      current = quadtree["getNodeView"](current).children[0];
      expect(current).not.toBe(-1);
    }

    // Should not split beyond max depth
    expect(quadtree["getNodeView"](current).children[0]).toBe(-1);
  });

  test("root nodes have correct neighbors", () => {
    for (let face = 0; face < 6; face++) {
      const rootIndex = quadtree["indexMap"].get(`${face}:0:0:0`)!;
      const rootNode = quadtree["getNodeView"](rootIndex);

      // Should have 4 neighbors (one for each direction)
      expect(rootNode.neighbors).toHaveLength(4);

      // All neighbors should be other root nodes
      rootNode.neighbors.forEach((neighborIndex) => {
        expect(neighborIndex).not.toBe(-1);

        const neighbor = quadtree["getNodeView"](neighborIndex);
        expect(neighbor.level).toBe(0);
        expect(neighbor.x).toBe(0);
        expect(neighbor.y).toBe(0);

        // Verify neighbor face matches adjacency configuration
        const directions = ["left", "right", "top", "bottom"];
        const direction = directions[rootNode.neighbors.indexOf(neighborIndex)];
        const expectedFace = quadtree["faceAdjacency"]
          .get(face as FaceIndex)
          ?.get(direction)?.face;

        expect(neighbor.face).toBe(expectedFace);
      });
    }
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

describe("CubeSphereQuadtree > Face Coordinate Mapping", () => {
  const testCases = [
    {
      face: 0,
      name: "Front face (+Z)",
      position: new THREE.Vector3(0, 0, 1),
      expected: { face: 0, x: 0, y: 0 },
    },
    {
      face: 1,
      name: "Back face (-Z)",
      position: new THREE.Vector3(0, 0, -1),
      expected: { face: 1, x: 0, y: 0 },
    },
    {
      face: 2,
      name: "Right face (+X)",
      position: new THREE.Vector3(1, 0, 0),
      expected: { face: 2, x: 0, y: 0 },
    },
    {
      face: 3,
      name: "Left face (-X)",
      position: new THREE.Vector3(-1, 0, 0),
      expected: { face: 3, x: 0, y: 0 },
    },
    {
      face: 4,
      name: "Top face (+Y)",
      position: new THREE.Vector3(0, 1, 0),
      expected: { face: 4, x: 0, y: 0 },
    },
    {
      face: 5,
      name: "Bottom face (-Y)",
      position: new THREE.Vector3(0, -1, 0),
      expected: { face: 5, x: 0, y: 0 },
    },
  ];

  test.each(testCases)("$name center detection", ({ position, expected }) => {
    const quadtree = new CubeSphereQuadtree();
    const nodeIndex = quadtree.findNodeAtPosition(
      position,
      1,
      new THREE.Vector3()
    );
    expect(nodeIndex).not.toBeNull();

    const node = quadtree["getNodeView"](nodeIndex!);
    expect(node.face).toBe(expected.face);
    expect(node.x).toBe(expected.x);
    expect(node.y).toBe(expected.y);
  });

  test("Child node detection on right face", () => {
    const quadtree = new CubeSphereQuadtree();
    const rootIndex = quadtree["indexMap"].get("2:0:0:0")!;
    quadtree.splitNode(rootIndex);

    // Test positions in each quadrant
    const testPositions = [
      { pos: new THREE.Vector3(1, 0.25, 0.25), expected: { x: 0, y: 1 } }, // -Z, +Y
      { pos: new THREE.Vector3(1, 0.25, -0.25), expected: { x: 1, y: 1 } }, // +Z, +Y
      { pos: new THREE.Vector3(1, -0.25, 0.25), expected: { x: 0, y: 0 } }, // -Z, -Y
      { pos: new THREE.Vector3(1, -0.25, -0.25), expected: { x: 1, y: 0 } }, // +Z, -Y
    ];

    for (const { pos, expected } of testPositions) {
      const nodeIndex = quadtree.findNodeAtPosition(
        pos,
        1,
        new THREE.Vector3(),
        true
      );
      expect(nodeIndex).not.toBeNull();

      const node = quadtree["getNodeView"](nodeIndex!);
      expect(node.face).toBe(2);
      expect(node.x).toBe(expected.x);
      expect(node.y).toBe(expected.y);
    }
  });

  test("Leaf node detection across faces", () => {
    const quadtree = new CubeSphereQuadtree();
    const cameraPos = new THREE.Vector3(0.001, 0.001, 0.001);
    quadtree.updateLOD(cameraPos, 3); // Force subdivision

    const testPositions = [
      new THREE.Vector3(0, 0, 1), // Front
      new THREE.Vector3(0, 0, -1), // Back
      new THREE.Vector3(1, 0, 0), // Right
      new THREE.Vector3(-1, 0, 0), // Left
      new THREE.Vector3(0, 1, 0), // Top
      new THREE.Vector3(0, -1, 0), // Bottom
    ];

    for (const pos of testPositions) {
      const nodeIndex = quadtree.findNodeAtPosition(
        pos,
        1,
        new THREE.Vector3(),
        true
      );
      expect(nodeIndex).not.toBeNull();

      const node = quadtree["getNodeView"](nodeIndex!);
      // Verify we're at maximum depth
      expect(node.level).toBe(3);
      expect(node.children[0]).toBe(-1);
    }
  });

  test("Mirroring check for adjacent faces", () => {
    const quadtree = new CubeSphereQuadtree();
    const epsilon = 0.01;

    // Test border between front and right faces
    const testPositions = [
      { pos: new THREE.Vector3(epsilon, 0, 1 - epsilon), expectedFace: 0 }, // Front face
      { pos: new THREE.Vector3(1 - epsilon, 0, epsilon), expectedFace: 2 }, // Right face
    ];

    for (const { pos, expectedFace } of testPositions) {
      const nodeIndex = quadtree.findNodeAtPosition(
        pos,
        1,
        new THREE.Vector3()
      );
      expect(nodeIndex).not.toBeNull();

      const node = quadtree["getNodeView"](nodeIndex!);
      expect(node.face).toBe(expectedFace);
    }
  });
});

describe("CubeSphereQuadtree > Neighbor Connections", () => {
  const testFace: FaceIndex = 0; // Front face
  let quadtree: TestCubeSphereQuadtree;

  // Helper function to validate neighbor relationships
  function validateNeighbors(
    nodeIndex: number,
    expected: {
      left: number | { face: FaceIndex; x: number; y: number };
      right: number | { face: FaceIndex; x: number; y: number };
      top: number | { face: FaceIndex; x: number; y: number };
      bottom: number | { face: FaceIndex; x: number; y: number };
    }
  ) {
    const node = quadtree["getNodeView"](nodeIndex);
    const neighbors = node.neighbors;

    const resolveExpected = (
      expected: number | { face: FaceIndex; x: number; y: number }
    ): number => {
      if (typeof expected === "number") return expected;
      const key = `${expected.face}:${node.level}:${expected.x}:${expected.y}`;
      return quadtree["indexMap"].get(key)!;
    };

    expect(neighbors[0]).toBe(resolveExpected(expected.left));
    expect(neighbors[1]).toBe(resolveExpected(expected.right));
    expect(neighbors[2]).toBe(resolveExpected(expected.top));
    expect(neighbors[3]).toBe(resolveExpected(expected.bottom));
  }

  beforeEach(() => {
    quadtree = new CubeSphereQuadtree() as unknown as TestCubeSphereQuadtree;
  });

  test("Level 1 subdivision neighbors", () => {
    const rootIndex = quadtree["indexMap"].get(`${testFace}:0:0:0`)!;
    quadtree.splitNode(rootIndex);
    const children = quadtree["getNodeView"](rootIndex).children;

    // Test all 4 children
    children.forEach((childIndex, quadrant) => {
      const child = quadtree["getNodeView"](childIndex);
      const [x, y] = [child.x, child.y];

      // Expected same-face neighbors
      const expected = {
        left: x > 0 ? children[quadrant - 1] : { face: 3, x: 1, y }, // Left face
        right: x < 1 ? children[quadrant + 1] : { face: 2, x: 0, y }, // Right face
        top:
          y < 1 ? children[quadrant + 2] : { face: 4, x: x, y: 0, rotation: 1 }, // Top face
        bottom: y > 0 ? children[quadrant - 2] : { face: 5, x, y: 1 }, // Bottom face
      };

      validateNeighbors(childIndex, expected);
    });
  });

  test("Level 2 subdivision with cross-face neighbors", () => {
    const rootIndex = quadtree["indexMap"].get(`${testFace}:0:0:0`)!;
    quadtree.splitNode(rootIndex);

    // Split the top-right child (quadrant 3)
    const level1Child = quadtree["getNodeView"](rootIndex).children[3];
    quadtree.splitNode(level1Child);
    const level2Children = quadtree["getNodeView"](level1Child).children;

    // Test all 4 level-2 children
    level2Children.forEach((childIndex, quadrant) => {
      const child = quadtree["getNodeView"](childIndex);
      const [x, y] = [child.x, child.y]; // Level 2 coordinates (0-3)

      // Expected neighbors
      const expected = {
        left:
          x > 0
            ? level2Children[quadrant - 1]
            : y < 2
            ? quadtree["indexMap"].get(`${testFace}:1:1:${y + 1}`)!
            : { face: 4, x: 3 - y, y: 0, rotation: 0 },
        right:
          x < 3
            ? level2Children[quadrant + 1]
            : { face: 2, x: 0, y: 3 - y, rotation: 0 },
        top:
          y < 3
            ? level2Children[quadrant + 2]
            : { face: 4, x: 3 - x, y: 0, rotation: 1 },
        bottom:
          y > 0
            ? level2Children[quadrant - 2]
            : x < 2
            ? quadtree["indexMap"].get(`${testFace}:1:${x + 1}:0`)!
            : { face: 5, x: 3 - x, y: 1, rotation: 0 },
      };

      validateNeighbors(childIndex, expected);
    });
  });

  test("Level 3 subdivision with complex rotations", () => {
    const rootIndex = quadtree["indexMap"].get(`${testFace}:0:0:0`)!;

    // Split to level 3
    quadtree.splitNode(rootIndex); // Level 1
    const level1Child = quadtree["getNodeView"](rootIndex).children[3];
    quadtree.splitNode(level1Child); // Level 2
    const level2Child = quadtree["getNodeView"](level1Child).children[3];
    quadtree.splitNode(level2Child); // Level 3

    const level3Children = quadtree["getNodeView"](level2Child).children;

    // Test edge cases
    const testCases = [
      {
        childIndex: level3Children[3], // Rightmost child
        expected: {
          right: {
            face: 2,
            x: 7 - quadtree["getNodeView"](level3Children[3]).y,
            y: 3 - quadtree["getNodeView"](level3Children[3]).y,
            rotation: 0,
          },
        },
      },
      {
        childIndex: level3Children[2], // Topmost child
        expected: {
          top: {
            face: 4,
            x: quadtree["getNodeView"](level3Children[2]).y,
            y: 0,
            rotation: 1,
          },
        },
      },
    ];

    testCases.forEach(({ childIndex, expected }) => {
      const child = quadtree["getNodeView"](childIndex);
      const neighborIndex = child.neighbors[1]; // Right neighbor
      const neighbor = quadtree["getNodeView"](neighborIndex);

      // Verify face and coordinates
      expect(neighbor.face).toBe(expected.right.face);

      // Verify rotated coordinates
      const [rotatedX, rotatedY] = quadtree["rotateCoordinates"](
        child.x,
        child.y,
        child.level,
        expected.right.rotation
      );
      expect(neighbor.x).toBe(rotatedX);
      expect(neighbor.y).toBe(rotatedY);

      // Verify bidirectional relationship
      const reverseNeighborIndex = neighbor.neighbors[0]; // Left neighbor of right neighbor
      expect(reverseNeighborIndex).toBe(childIndex);
    });
  });

  test("Deep subdivision consistency check", () => {
    const rootIndex = quadtree["indexMap"].get(`${testFace}:0:0:0`)!;
    let currentParent = rootIndex;

    // Split 5 levels deep
    for (let level = 1; level <= 5; level++) {
      quadtree.splitNode(currentParent);
      currentParent = quadtree["getNodeView"](currentParent).children[0];
    }

    // Test leaf node neighbors
    const leafNode = quadtree["getNodeView"](currentParent);
    const maxCoord = (1 << leafNode.level) - 1;

    // Expected neighbors based on position (0,0 at max depth)
    const expected = {
      left: { face: 3, x: maxCoord, y: 0, rotation: 0 },
      right: { face: 2, x: 0, y: maxCoord, rotation: 0 },
      top: quadtree["indexMap"].get(`${testFace}:${leafNode.level}:0:1`),
      bottom: { face: 5, x: 0, y: maxCoord, rotation: 0 },
    };

    validateNeighbors(currentParent, expected);

    // Verify all neighbors exist and reference back
    leafNode.neighbors.forEach((neighborIndex, direction) => {
      if (neighborIndex === -1) return;

      const neighbor = quadtree["getNodeView"](neighborIndex);
      const reverseDirection = [1, 0, 3, 2][direction]; // Opposite direction
      const reverseNeighborIndex = neighbor.neighbors[reverseDirection];

      expect(reverseNeighborIndex).toBe(currentParent);
    });
  });
});
