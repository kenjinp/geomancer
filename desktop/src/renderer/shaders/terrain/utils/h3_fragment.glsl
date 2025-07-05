// H3 utility functions specifically for fragment shaders
// This file contains fragment shader-specific implementations that use textureCube

// Precise H3 identifier lookup for fragment shaders
// Uses standard textureCube function (available in fragment shaders)
uint getH3IdentifierFragment(vec3 direction) {
    // Use standard cube texture sampling for fragment shaders
    vec4 color = textureCube(h3IndexMap, normalize(direction));
    
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

// Context-aware function for elevation calculations in fragment shaders
uint getH3IdentifierForElevation(vec3 direction) {
    return getH3IdentifierFragment(direction);
} 