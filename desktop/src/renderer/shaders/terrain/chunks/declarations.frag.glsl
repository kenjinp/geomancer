precision highp float;

// Custom terrain declarations
uniform int uMapMode;
uniform vec4 uMapLayers;
uniform int uSelectedTile;
uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform sampler2D hexTileIntBuffer;
uniform sampler2D hexTileFloatBuffer;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vSphereNormal;
varying vec3 vOriginalPosition; 