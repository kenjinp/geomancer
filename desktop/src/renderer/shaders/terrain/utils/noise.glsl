// Noise utility functions

vec2 random2(float n) {
    vec2 s = vec2(n);
    return -1.0 + 2.0 * fract(sin(vec2(dot(s,vec2(127.1,311.7)),
                                     dot(s,vec2(269.5,183.3))))*43758.5453123);
}

vec3 jitterPosition(vec3 position, float seed, float amount) {
    // Get a random offset direction
    vec2 rand = random2(seed);
    vec3 tangent = normalize(cross(position, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = normalize(cross(position, tangent));
    
    // Apply jitter in tangent space
    return normalize(position + (tangent * rand.x + bitangent * rand.y) * amount);
}

vec3 hash31(float p) {
    vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xxy+p3.yzz)*p3.zyx); 
}

vec3 hashFloat(float f) {
    // Convert float to integer for bit manipulation
    uint seed = uint(f);
    
    // Mix bits using XOR and shifts (similar to hashH3Id)
    seed ^= (seed << 13u);
    seed ^= (seed >> 17u);
    seed ^= (seed << 5u);
    
    // Convert to RGB components between 0 and 1
    return vec3(
        float((seed >> 16u) & 0xFFu) / 255.0,
        float((seed >> 8u) & 0xFFu) / 255.0,
        float(seed & 0xFFu) / 255.0
    );
} 