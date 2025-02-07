uniform sampler2D nodeBuffer;
uniform float planetRadius;

varying vec3 vWorldPosition;
varying vec4 vNeighborInfo;

void main() {
    // Get node data from buffer texture
    vec4 nodeData = texelFetch(nodeBuffer, ivec2(gl_InstanceID, 0), 0);
    
    // Decode node properties
    vec2 facePosition = nodeData.xy;
    float level = nodeData.z;
    float face = nodeData.w;
    
    // Convert face position to world coordinates
    vec3 cubePosition = faceToCube(face, facePosition);
    vec3 spherePosition = normalize(cubePosition) * planetRadius;
    
    // Calculate LOD transitions
    float scale = 1.0 / pow(2.0, level);
    vec3 scaledPosition = cubePosition * scale;
    
    // Apply final position
    vec4 worldPosition = modelMatrix * vec4(spherePosition + scaledPosition, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    
    // Pass data to fragment shader
    vWorldPosition = worldPosition.xyz;
}