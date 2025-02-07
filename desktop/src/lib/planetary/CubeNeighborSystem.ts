import { CubeFace } from "./QuadtreeSystem";

export class CubeNeighborSystem {
  private static readonly faceConnections: Record<
    CubeFace,
    [CubeFace, number][]
  > = [
    /* 0 Front */ [
      [4, 0],
      [5, 0],
      [1, 0],
      [3, 0],
    ], // N, S, E, W
    /* 1 Right */ [
      [4, 1],
      [5, 1],
      [2, 0],
      [0, 0],
    ], // N, S, E, W
    /* 2 Back */ [
      [4, 2],
      [5, 2],
      [3, 0],
      [1, 0],
    ], // N, S, E, W
    /* 3 Left */ [
      [4, 3],
      [5, 3],
      [0, 0],
      [2, 0],
    ], // N, S, E, W
    /* 4 Top */ [
      [2, 2],
      [0, 2],
      [1, 3],
      [3, 1],
    ], // N, S, E, W
    /* 5 Bottom */ [
      [0, 2],
      [2, 2],
      [1, 1],
      [3, 3],
    ], // N, S, E, W
  ];

  static findNeighborAcrossFaces(
    x: number,
    y: number,
    level: number,
    face: CubeFace,
    direction: number
  ): { face: CubeFace; x: number; y: number; level: number } | null {
    const [newFace, rotation] = this.faceConnections[face][direction];
    const scaled = this.scaleToEdge(x, y, direction, level);
    const transformed = this.transformCoordinates(
      scaled.x,
      scaled.y,
      direction,
      rotation
    );

    return {
      face: newFace,
      x: transformed.x,
      y: transformed.y,
      level: level,
    };
  }

  private static scaleToEdge(
    x: number,
    y: number,
    direction: number,
    level: number
  ): { x: number; y: number } {
    const epsilon = 1 / Math.pow(2, level + 2); // Prevent edge overlap

    switch (direction) {
      case 0: // North
        return { x: x, y: 1 - epsilon };
      case 1: // South
        return { x: 1 - epsilon, y: y };
      case 2: // East
        return { x: 1 - epsilon, y: y };
      case 3: // West
        return { x: x, y: 1 - epsilon };
      default:
        return { x, y };
    }
  }

  private static transformCoordinates(
    x: number,
    y: number,
    dir: number,
    rotation: number
  ): { x: number; y: number } {
    // Transform coordinates based on edge rotation
    let newX = x;
    let newY = y;

    switch (rotation) {
      case 0: // No rotation
        break;
      case 1: // 90 degree clockwise
        [newX, newY] = [1 - y, x];
        break;
      case 2: // 180 degree
        [newX, newY] = [1 - x, 1 - y];
        break;
      case 3: // 90 degree counter-clockwise
        [newX, newY] = [y, 1 - x];
        break;
    }

    // Mirror coordinates based on edge direction
    switch (dir) {
      case 0: // North
        newY = 1 - newY;
        break;
      case 1: // South
        newX = 1 - newX;
        break;
      case 2: // East
        [newX, newY] = [newY, newX];
        break;
      case 3: // West
        [newX, newY] = [1 - newY, 1 - newX];
        break;
    }

    return { x: this.clamp(newX), y: this.clamp(newY) };
  }

  private static clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
