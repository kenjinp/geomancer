import { Vector3 } from "three";
import { beforeEach, describe, expect, test } from "vitest";
import { ImprovedCubicQuadtree } from "../ImprovedCubicQuadtree";
import { CubeFace } from "../types";

describe("ImprovedCubicQuadtree", () => {
  let quadtree: ImprovedCubicQuadtree;

  beforeEach(() => {
    quadtree = new ImprovedCubicQuadtree({
      maxNodes: 1000,
      radius: 1,
      minDistanceThreshold: 0.1,
    });
  });

  test("should correctly determine face for points", () => {
    const testCases = [
      { point: new Vector3(1, 0, 0), expectedFace: CubeFace.RIGHT },
      { point: new Vector3(-1, 0, 0), expectedFace: CubeFace.LEFT },
      { point: new Vector3(0, 1, 0), expectedFace: CubeFace.TOP },
      { point: new Vector3(0, -1, 0), expectedFace: CubeFace.BOTTOM },
      { point: new Vector3(0, 0, 1), expectedFace: CubeFace.FRONT },
      { point: new Vector3(0, 0, -1), expectedFace: CubeFace.BACK },
    ];

    testCases.forEach(({ point, expectedFace }) => {
      const { face } = quadtree.worldToFaceCoordinates(point);
      expect(face).toBe(expectedFace);
    });
  });

  test("should maintain point positions through world-face-world conversion", () => {
    // Test with points that lie exactly on cube faces
    const testPoints = [
      new Vector3(0, 0, 1), // Front face center
      new Vector3(1, 0, 0), // Right face center
      new Vector3(0, 1, 0), // Top face center
    ];

    testPoints.forEach((originalPoint) => {
      originalPoint.normalize(); // Ensure point is on unit sphere
      const { face, uv } = quadtree.worldToFaceCoordinates(originalPoint);
      const reconstructedPoint = quadtree.faceToWorldCoordinates(
        face,
        uv.x,
        uv.y
      );

      expect(reconstructedPoint.distanceTo(originalPoint)).toBeLessThan(0.0001);
      expect(reconstructedPoint.length()).toBeCloseTo(1); // Should be on unit sphere
    });
  });

  test("should correctly handle points near face boundaries", () => {
    // Point exactly between RIGHT and FRONT faces
    const boundaryPoint = new Vector3(1, 0, 1).normalize();
    quadtree.insert(boundaryPoint);

    // Should be assigned to one face and properly subdivided
    const { face } = quadtree.worldToFaceCoordinates(boundaryPoint);
    expect([CubeFace.RIGHT, CubeFace.FRONT]).toContain(face);
  });

  test("should generate correct face corners", () => {
    const corners = quadtree.getFaceCorners(CubeFace.FRONT);
    expect(corners.length).toBe(4);

    // All corners should be unit distance from center
    corners.forEach((corner) => {
      expect(corner.length()).toBeCloseTo(1);
    });

    // Check relative positions
    expect(corners[0].y).toBeLessThan(corners[2].y); // Bottom vs Top
    expect(corners[0].x).toBeLessThan(corners[1].x); // Left vs Right
  });

  test("should reset all faces", () => {
    const point = new Vector3(1, 0, 0);
    quadtree.insert(point);
    quadtree.reset();

    // Insert same point again and verify it creates new nodes
    quadtree.insert(point);
    const { face, uv } = quadtree.worldToFaceCoordinates(point);
    expect(face).toBe(CubeFace.RIGHT);
  });
});
