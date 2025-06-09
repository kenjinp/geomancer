// Custom terrain declarations
uniform float uRadius;
uniform vec3 uOffset;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vSphereNormal;
varying vec3 vOriginalPosition; 
uniform uint uMapMode;
uniform uint uMapLayers;
uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform usampler2D hexTileIntBuffer;
uniform sampler2D hexTileFloatBuffer;
uniform float uHexJitterAmount;
uniform bool uApplyHexJitter;

// Include vertex-specific functions first
#include "../utils/vertex_functions.glsl"

// Include utility functions next
#include "../utils/math.glsl"
#include "../utils/latlong.glsl"
#include "../utils/grid.glsl"
#include "../utils/noise.glsl"
#include "../utils/h3.glsl"
#include "../utils/tiledata.glsl"
#include "../utils/lighting.glsl"
#include "../utils/layers.glsl"

// Include elevation module last
#include "elevation.glsl"