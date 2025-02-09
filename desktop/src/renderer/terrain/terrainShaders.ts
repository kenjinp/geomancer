export const terrainVertexShader = /* glsl */ `
uniform float uRadius;
uniform vec3 uOffset;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vInstanceColor;
// attribute vec3 instanceColor;

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

void main() {
    // Generate color from instance ID
    int instanceId = gl_InstanceID;
    float instanceIdFloat = float(instanceId);
    float r = hash(instanceIdFloat);
    float g = hash(instanceIdFloat + 1.0);
    float b = hash(instanceIdFloat + 2.0);
    vec3 color = vec3(r, g, b);

    // Get original plane position (-0.5 to 0.5 on XY)
    vec3 pos = position;
    
    // Apply instance transformation
    vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
    
    // Convert cube position to sphere
    vec3 sphereDirection = normalize(worldPosition.xyz - uOffset);
    vec3 spherePosition = uOffset + sphereDirection * uRadius;
    
    // Transform to view space
    vec4 modelViewPosition = modelViewMatrix * vec4(spherePosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;
    
    // Pass varyings
    vNormal = normalize(normalMatrix * sphereDirection);
    vPosition = spherePosition;
    vInstanceColor = instanceColor;
}
`;

export const terrainFragmentShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vInstanceColor;

void main() {
    // Basic color with fake lighting
    // vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    // float diff = max(dot(vNormal, lightDir), 0.2);
    
    // Use instance color with lighting
    gl_FragColor = vec4(vInstanceColor, 1.0);
}
`;
