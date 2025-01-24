// Constants for memory layout
export const FLOAT_SIZE = 4;
export const NODE_FLOAT_COUNT = 15; // 3 for center, 3 for sphereCenter, 3 for size, 6 for bounds
export const NODE_INT_COUNT = 12; // 4 for child indices, 1 for childCount, 1 for flags, 1 for parent, 1 for face, 4 for neighbors
export const MAX_NODES_PER_TREE = 3_000;
