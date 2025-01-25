export enum QuadtreeConstants {
  MAX_DEPTH = 8,
  CHILD_COUNT = 4,
  ROOT_LEVEL = 0,
  ROOT_SIZE = 1,
  INVALID_INDEX = -1,
}

export enum FloatBufferOffsets {
  X = 0,
  Y = 1,
  SIZE = 2,
  FLOAT_VALUES_PER_NODE = 3,
}

export enum IntBufferOffsets {
  LEVEL = 0,
  CHILD_INDEX_TL = 1, // Top-left child
  CHILD_INDEX_TR = 2, // Top-right child
  CHILD_INDEX_BL = 3, // Bottom-left child
  CHILD_INDEX_BR = 4, // Bottom-right child
  FACE_INDEX = 5,
  HAS_CHILDREN = 6,
  NEIGHBOR_NORTH = 7,
  NEIGHBOR_SOUTH = 8,
  NEIGHBOR_EAST = 9,
  NEIGHBOR_WEST = 10,
  INT_VALUES_PER_NODE = 11,
}

export enum ChildIndex {
  TOP_LEFT = 0,
  TOP_RIGHT = 1,
  BOTTOM_LEFT = 2,
  BOTTOM_RIGHT = 3,
}

export enum Direction {
  NORTH = IntBufferOffsets.NEIGHBOR_NORTH,
  SOUTH = IntBufferOffsets.NEIGHBOR_SOUTH,
  EAST = IntBufferOffsets.NEIGHBOR_EAST,
  WEST = IntBufferOffsets.NEIGHBOR_WEST,
}
