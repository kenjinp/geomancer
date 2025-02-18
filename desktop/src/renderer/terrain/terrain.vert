varying vec2 vUv;
uniform float uRadius;
uniform vec3 uOffset;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vColor;

void main() {
    // Combine model and instance matrices first
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 sphereDirection = normalize(worldPosition.xyz - uOffset);
    vec3 spherePosition = uOffset + sphereDirection * uRadius;
    vInstanceId = float(gl_InstanceID);
    // Transform to view space
    vec4 modelViewPosition = modelViewMatrix * vec4(spherePosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    vWorldPosition = worldPosition;
    vColor = instanceColor;
    vUv = uv;
}