precision highp float;
#define PI 3.141592653589793
#define FACE_SIZE 512 

#include ./h3-geometry.glsl;

in vec3 vWorldPosition;
out vec4 outColor;
uniform vec3 uColor;

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

vec3 getH3Color(uint h3Index) {
  return vec3(hash(vec3(h3Index)));
}

void main() {
  uint h3Index = getH3Index(vWorldPosition);
  vec3 color = getH3Color(h3Index);
  outColor = vec4(vec3(float(h3Index)), 1.0);
}