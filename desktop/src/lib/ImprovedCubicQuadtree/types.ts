import { Vector3 } from "three";

export interface QuadNode {
  x: number;
  y: number;
  level: number;
  size: number;
  childIndex: number;
  faceIndex: number;
  hasChildren: boolean;
  neighbors: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface NodeBufferConfig {
  maxNodes: number;
  radius: number; // Radius of the sphere
  minDistanceThreshold: number; // Minimum distance between points at max subdivision
}

export enum CubeFace {
  FRONT = 0,
  RIGHT = 1,
  BACK = 2,
  LEFT = 3,
  TOP = 4,
  BOTTOM = 5,
}

export interface FaceTransform {
  rotation: Vector3;
  translation: Vector3;
}
