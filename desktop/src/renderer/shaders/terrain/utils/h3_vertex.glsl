// H3 utility functions specifically for vertex shaders
// This file contains vertex shader-specific implementations that use sampleCubeTexture

// Precise H3 identifier lookup for vertex shaders
// Uses cross-compatible cube texture sampling from vertex_functions.glsl
uint getH3IdentifierVertex(vec3 direction) {
    // Use the cross-compatible cube texture sampling function (only available in vertex shaders)
    vec4 color = sampleCubeTexture(h3IndexMap, normalize(direction));
    
    // Extract RGB values and convert to unsigned integers
    uvec3 rgb = uvec3(color.rgb * 255.0);
    
    // Pack RGB into a single H3 identifier
    uint currentId;
    if (rgb.r == 0u && rgb.g == 0u && rgb.b == 0u) {
        currentId = 0u; // Use 0 for black (no H3 data)
    } else {
        currentId = (rgb.r << 16u) | (rgb.g << 8u) | rgb.b;
    }
    
    return currentId;
}

// Context-aware function for elevation calculations in vertex shaders
uint getH3IdentifierForElevation(vec3 direction) {
    return getH3IdentifierVertex(direction);
} 