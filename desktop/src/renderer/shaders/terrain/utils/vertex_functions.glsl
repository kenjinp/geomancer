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

// Cross-compatible cube texture sampling function
// Works in both WebGL 1.0 and 2.0 vertex shaders
vec4 sampleCubeTexture(samplerCube sampler, vec3 direction) {
    // Method 1: Try modern WebGL 2.0 approach
    #ifdef GL_ES
        #if __VERSION__ >= 300
            return texture(sampler, direction);
        #else
            return textureCube(sampler, direction);
        #endif
    #else
        // Desktop OpenGL
        return texture(sampler, direction);
    #endif
}

// Alternative: Manual cube texture sampling if native functions fail
// This would convert the cube lookup to individual face lookups
// vec4 manualCubeTextureSample(samplerCube sampler, vec3 dir) {
//     // Normalize the direction
//     vec3 absDir = abs(dir);
//     float maxComponent = max(max(absDir.x, absDir.y), absDir.z);
    
//     // For now, return a basic approximation based on direction
//     // This is a fallback if all else fails - you'd need to implement
//     // proper face selection and UV calculation here
//     if (maxComponent == absDir.x) {
//         return vec4(1.0, 0.0, 0.0, 1.0); // Red for X-dominant
//     } else if (maxComponent == absDir.y) {
//         return vec4(0.0, 1.0, 0.0, 1.0); // Green for Y-dominant  
//     } else {
//         return vec4(0.0, 0.0, 1.0, 1.0); // Blue for Z-dominant
//     }
// }

// Note: textureCube is natively supported in WebGL vertex shaders
// No custom implementation needed - the native function works perfectly 