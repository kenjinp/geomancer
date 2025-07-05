precision highp float;

// Custom terrain declarations
uniform uint uMapMode;
uniform uint uMapLayers;
uniform int uSelectedTile;
uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform usampler2D hexTileIntBuffer;
uniform sampler2D hexTileFloatBuffer;
uniform float uHexJitterAmount;
uniform bool uApplyHexJitter;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vSphereNormal;
varying vec3 vOriginalPosition; 
uniform vec3 uOffset;
uniform float uRadius;

// Include utility functions first
#include "../../../../lib/cartography/colors.glsl"
#include "../utils/math.glsl"
#include "../utils/latlong.glsl"
#include "../utils/grid.glsl"
#include "../utils/noise.glsl"
#include "../utils/h3.glsl"
#include "../utils/tiledata.glsl"
#include "../utils/lighting.glsl"
#include "../utils/layers.glsl"
#include "../utils/h3_fragment.glsl"

// Include elevation module last
#include "elevation.glsl"