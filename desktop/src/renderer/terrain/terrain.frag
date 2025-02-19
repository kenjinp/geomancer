uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform sampler2D map;
uniform vec3 uOffset;
uniform float uRadius;
varying vec2 vUv;
varying vec4 vWorldPosition;
varying float vInstanceId;

// Computes the great circle distance (in radians) between two points on a sphere.
// If the sphere has radius r, multiply the result by r for the surface distance.
float greatCircleDistance(vec3 a, vec3 b) {
    // Normalize input vectors in case they aren't unit length.
    vec3 na = normalize(a);
    vec3 nb = normalize(b);
    
    // Calculate cosine of the angle between them and clamp to the valid range.
    float cosTheta = clamp(dot(na, nb), -1.0, 1.0);
    
    // Return the angular distance (in radians)
    return acos(cosTheta);
}

uint getNeighborH3Id( float baseId,  float direction) {
    // Ensure precise calculations for large numbers
     float index = baseId * 6.0 + direction;
    vec2 texSize = vec2(textureSize(h3NeighborMap, 0));
     float texWidth = texSize.x;
     float texHeight = texSize.y;

    // Calculate exact grid position with high precision
     float row = floor(index / texWidth);
     float col = mod(index, texWidth);

    // Convert to UV coordinates
    vec2 uv = vec2(
        (col + 0.5) / texWidth,
        (row + 0.5) / texHeight
    );

    vec4 packed = texture2D(h3NeighborMap, uv);
    
    // More precise conversion from color to uint
    uint r = uint(floor(packed.r * 255.0 + 0.5));
    uint g = uint(floor(packed.g * 255.0 + 0.5));
    uint b = uint(floor(packed.b * 255.0 + 0.5));
    
    // Check for sentinel value (invalid neighbor)
    if (r == 255u && g == 255u && b == 255u) {
        return 0u;
    }
    
    return (r << 16u) | (g << 8u) | b;
}

vec3 getH3Position(float h3Id) {
    ivec2 texSize = textureSize(h3PositionMap, 0);
    float texWidth = float(texSize.x);
    float texHeight = float(texSize.y);
    
    // Calculate exact grid position
    float row = floor(h3Id / texWidth);
    float col = h3Id - row * texWidth;

    // Handle edge case where row might equal texture height
    row = min(row, texHeight - 1.0);

    // Convert to UV with half-texel offset
    vec2 uv = vec2(
        (col + 0.5) / texWidth,
        (row + 0.5) / texHeight
    );
    
    return texture2D(h3PositionMap, uv).xyz;
}

uint getH3IdentifierCube(vec3 direction) {
    vec4 color = textureCube(h3IndexMap, direction);
    uint r = uint(floor(color.r * 255.0 + 0.5));
    uint g = uint(floor(color.g * 255.0 + 0.5));
    uint b = uint(floor(color.b * 255.0 + 0.5));
    return (r << 16) | (g << 8) | b;
}

uint findClosestCell(vec3 position, uint initialId) {
    vec3 normalizedPos = normalize(position);
    vec3 initialCenter = normalize(getH3Position(float(initialId)));
    float minDist = greatCircleDistance(normalizedPos, initialCenter);
    uint closestId = initialId;
    
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(initialId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId)));
        float dist = greatCircleDistance(normalizedPos, neighborCenter);
        
        if (dist < minDist) {
            minDist = dist;
            closestId = neighborId;
        }
    }
    
    return closestId;
}

vec3 hash31(float p)
{
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

float getEdgeFactor(vec3 position, uint cellId) {
    vec3 normalizedPos = normalize(position);
    
    // Get distance to current cell center
    vec3 cellCenter = normalize(getH3Position(float(cellId)));
    float dist1 = greatCircleDistance(normalizedPos, cellCenter);
    
    // Find distance to closest neighbor
    float dist2 = 26000.0;  // Second closest distance
    
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(cellId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId)));
        float dist = greatCircleDistance(normalizedPos, neighborCenter);
        if (dist < dist2) {
            dist2 = dist;
        }
    }
    
    // Calculate edge using difference of distances
    float d = abs(dist1 - dist2) * uRadius; // Scale by radius for consistent width
    
    // Sharper edge calculation
    float width = 2.0;
    float dd = fwidth(d);
    return 1.0 - smoothstep(0.0, dd * width, d);
}

void main() {
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    
    uint currentId = getH3IdentifierCube(sphereDirection);
    uint closestId = findClosestCell(spherePos, currentId);
    
    vec3 cellColor = hashFloat(float(closestId));
    float edge = getEdgeFactor(spherePos, closestId);
    
    // Sharper mix for the edges
    vec3 finalColor = mix(cellColor, vec3(0.0), smoothstep(0.4, 0.6, edge));
    
    gl_FragColor = vec4(finalColor, 1.0);
}
