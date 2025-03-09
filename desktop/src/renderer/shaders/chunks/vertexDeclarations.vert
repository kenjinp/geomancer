// Custom uniform and varying declarations for sphere projection
uniform float uRadius;
uniform vec3 uOffset;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vSphereNormal; // Will contain the view-space sphere normal
varying vec3 vOriginalPosition; // To store original position for shadow calculations 