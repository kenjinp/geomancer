// Constants for memory layout
export const FLOAT_SIZE = 4;
export const NODE_FLOAT_COUNT = 15; // 3 for center, 3 for sphereCenter, 3 for size, 6 for bounds
export const NODE_INT_COUNT = 12; // 4 for child indices, 1 for childCount, 1 for flags, 1 for parent, 1 for face, 4 for neighbors
export const MAX_NODES_PER_TREE = 3_000;

// Float buffer indices
export enum NodeFloatIndex {
  // Center coordinates
  CENTER_X = 0,
  CENTER_Y = 1,
  CENTER_Z = 2,
  // Sphere center coordinates
  SPHERE_CENTER_X = 3,
  SPHERE_CENTER_Y = 4,
  SPHERE_CENTER_Z = 5,
  // Size components
  SIZE_X = 6,
  SIZE_Y = 7,
  SIZE_Z = 8,
  // Bounds (min/max)
  BOUNDS_MIN_X = 9,
  BOUNDS_MIN_Y = 10,
  BOUNDS_MIN_Z = 11,
  BOUNDS_MAX_X = 12,
  BOUNDS_MAX_Y = 13,
  BOUNDS_MAX_Z = 14,
}

// Integer buffer indices
export enum NodeIntIndex {
  CHILD_BOTTOM_LEFT = 0,
  CHILD_BOTTOM_RIGHT = 1,
  CHILD_TOP_LEFT = 2,
  CHILD_TOP_RIGHT = 3,
  CHILD_COUNT = 4,
  FLAGS = 5,
  PARENT = 6,
  FACE = 7,
  NEIGHBOR_LEFT = 8,
  NEIGHBOR_RIGHT = 9,
  NEIGHBOR_TOP = 10,
  NEIGHBOR_BOTTOM = 11,
}

export enum FLAGS {
  IS_ROOT = 1 << 0,
  IS_LEAF = 1 << 1,
  IS_SPLIT = 1 << 2,
  IS_BOUNDARY = 1 << 3,
}
