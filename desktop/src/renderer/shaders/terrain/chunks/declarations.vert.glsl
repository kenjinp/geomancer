// Custom terrain declarations
uniform float uRadius;
uniform vec3 uOffset;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vSphereNormal;
varying vec3 vOriginalPosition; 
uniform uint uMapMode;
uniform uint uMapLayers;


#include "../utils/layers.glsl"