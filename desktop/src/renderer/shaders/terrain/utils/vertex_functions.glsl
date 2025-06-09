// Vertex-specific utility functions

// Implementation of fwidth for vertex shaders
float fwidth(float p) {
    return 0.01; // Default value for vertex shaders
}

vec2 fwidth(vec2 p) {
    return vec2(0.01); // Default value for vertex shaders
}

vec3 fwidth(vec3 p) {
    return vec3(0.01); // Default value for vertex shaders
}

vec4 fwidth(vec4 p) {
    return vec4(0.01); // Default value for vertex shaders
}

// Implementation of textureCube for vertex shaders
vec4 textureCube(samplerCube sampler, vec3 coord) {
    // Normalize the direction vector
    vec3 dir = normalize(coord);
    
    // Determine which face of the cube we're sampling from
    // by finding the component with the largest absolute value
    vec3 absDir = abs(dir);
    float maxComponent = max(max(absDir.x, absDir.y), absDir.z);
    
    // Calculate the face index (0-5) based on the dominant component
    int faceIndex;
    vec2 faceCoord;
    
    if (absDir.x == maxComponent) {
        // X-axis dominant (left or right face)
        faceIndex = dir.x > 0.0 ? 0 : 1; // 0 = right, 1 = left
        faceCoord = vec2(-dir.z, dir.y) / absDir.x;
    } else if (absDir.y == maxComponent) {
        // Y-axis dominant (top or bottom face)
        faceIndex = dir.y > 0.0 ? 2 : 3; // 2 = top, 3 = bottom
        faceCoord = vec2(dir.x, -dir.z) / absDir.y;
    } else {
        // Z-axis dominant (front or back face)
        faceIndex = dir.z > 0.0 ? 4 : 5; // 4 = front, 5 = back
        faceCoord = vec2(dir.x, dir.y) / absDir.z;
    }
    
    // Convert from [-1, 1] to [0, 1] range
    faceCoord = faceCoord * 0.5 + 0.5;
    
    // In a real implementation, we would sample from the appropriate face of the cube texture
    // For now, we'll return a placeholder value based on the face index
    // This is just for compilation - in a real implementation, you would need to access the texture data
    
    // Return a color based on the face index
    vec4 color;
    if (faceIndex == 0) color = vec4(1.0, 0.0, 0.0, 1.0); // Right face - red
    else if (faceIndex == 1) color = vec4(0.0, 1.0, 0.0, 1.0); // Left face - green
    else if (faceIndex == 2) color = vec4(0.0, 0.0, 1.0, 1.0); // Top face - blue
    else if (faceIndex == 3) color = vec4(1.0, 1.0, 0.0, 1.0); // Bottom face - yellow
    else if (faceIndex == 4) color = vec4(1.0, 0.0, 1.0, 1.0); // Front face - magenta
    else color = vec4(0.0, 1.0, 1.0, 1.0); // Back face - cyan
    
    return color;
} 