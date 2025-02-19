precision highp float;

uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform sampler2D map;
uniform vec3 uOffset;
uniform float uRadius;
varying vec2 vUv;
varying vec4 vWorldPosition;
varying float vInstanceId;
// uniform mat4 uModelMatrix;  // <-- This isn't used in calculations

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

uint getNeighborH3Id(highp float baseId, highp float direction) {
    // Ensure precise calculations for large numbers
    highp float index = baseId * 6.0 + direction;
    vec2 texSize = vec2(textureSize(h3NeighborMap, 0));
    highp float texWidth = texSize.x;
    highp float texHeight = texSize.y;

    // Calculate exact grid position with high precision
    highp float row = floor(index / texWidth);
    highp float col = mod(index, texWidth);

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

float edgeFactor(vec3 worldPos, uint cellId) {
    vec3 center = getH3Position(float(cellId));
    float minAngle = 1e10;
    
    for(int i=0; i<6; i++) {
        uint neighborId = getNeighborH3Id(float(cellId), float(i));
        if(neighborId == 0u) continue;
        
        vec3 neighborPos = getH3Position(float(neighborId));
        vec3 edgeNormal = normalize(cross(center, neighborPos));
        float angle = acos(dot(normalize(worldPos), edgeNormal));
        minAngle = min(minAngle, angle);
    }
    
    return smoothstep(0.0, 0.01, minAngle);
}

void main() {
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    
    uint currentId = getH3IdentifierCube(sphereDirection);
    uint closestId = findClosestCell(spherePos, currentId);
    
    // Simple visualization - each cell gets a unique color
    vec3 cellColor = hashFloat(float(closestId));
    
    // Add a subtle edge effect
    float edge = edgeFactor(spherePos, closestId);
    cellColor = mix(cellColor, vec3(0.0), edge * 0.3);
    
    gl_FragColor = vec4(cellColor, 1.0);
}
