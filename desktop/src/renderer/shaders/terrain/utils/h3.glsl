// H3 utility functions

// Fallback function that uses approximation (used when cube texture access fails)
uint getH3IdentifierFallback(vec3 direction) {
    // Convert 3D direction to spherical coordinates for approximation
    vec3 normalized = normalize(direction);
    float lat = asin(normalized.y);
    float lon = atan(normalized.z, normalized.x);
    
    // Convert to degrees and normalize to 0-1 range
    float latNorm = (lat + 1.5708) / 3.1416; // (-PI/2 to PI/2) -> (0 to 1)
    float lonNorm = (lon + 3.1416) / 6.2832;  // (-PI to PI) -> (0 to 1)
    
    // Create a simple hash based on lat/lon
    uint latInt = uint(latNorm * 255.0);
    uint lonInt = uint(lonNorm * 255.0);
    uint hash = (latInt << 8) | lonInt;
    
    return hash;
}

uint getNeighborH3Id(float baseId, float direction) {
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

vec3 getH3PositionPrivate(float h3Id) {
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

    vec3 position = texture2D(h3PositionMap, uv).xyz;
    
    return position;
}


// Updated version - much more aggressive jitter
vec3 getH3Position(float h3Id, bool applyJitter, float jitterAmount) {
    vec3 position = getH3PositionPrivate(h3Id);

    if (applyJitter) {
        // Apply jitter to the position
        vec3 jittered = jitterPosition(position, h3Id, jitterAmount);
        
        // Normalize to keep on sphere surface
        position = normalize(jittered);
    }
    
    return position;
}

uint findClosestCell(vec3 position, uint initialId, bool applyJitter, float jitterAmount) {
    vec3 normalizedPos = normalize(position);
    vec3 initialCenter = normalize(getH3Position(float(initialId), applyJitter, jitterAmount));
    float minDist = greatCircleDistance(normalizedPos, initialCenter);
    uint closestId = initialId;
    
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(initialId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId), applyJitter, jitterAmount));
        float dist = greatCircleDistance(normalizedPos, neighborCenter);
        
        if (dist < minDist) {
            minDist = dist;
            closestId = neighborId;
        }
    }
    
    return closestId;
}

// Then modify findClosestAndSecondClosestCell to use jittered positions
vec2 findClosestAndSecondClosestCell(vec3 position, uint initialId, bool applyJitter, float jitterAmount) {
    vec3 normalizedPos = normalize(position);
    vec3 initialCenter = normalize(getH3Position(float(initialId), applyJitter, jitterAmount));
    float minDist = greatCircleDistance(normalizedPos, initialCenter);
    float secondMinDist = 1000.0;
    uint closestId = initialId;
    uint secondClosestId = initialId;
    float maxDist = 0.0;
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(initialId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId), applyJitter, jitterAmount));
        float dist = greatCircleDistance(normalizedPos, neighborCenter);
        
        if (dist < minDist) {
            secondMinDist = minDist;
            secondClosestId = closestId;
            minDist = dist;
            closestId = neighborId;
        } else if (dist < secondMinDist) {
            secondMinDist = dist;
            secondClosestId = neighborId;
        }
        maxDist = max(maxDist, dist);
    }
    
    return vec2(float(closestId), float(secondClosestId));
}

float getEdgeFactor(vec3 position, uint cellId, bool applyJitter, float jitterAmount, float edgeWidth) {
    vec3 normalizedPos = normalize(position);
    vec3 cellCenter = normalize(getH3Position(float(cellId), applyJitter, jitterAmount));
    float distToCenter = greatCircleDistance(normalizedPos, cellCenter);
    
    // Check distance to all neighbors
    float minNeighborDist = 1000.0;
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(cellId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId), applyJitter, jitterAmount));
        float dist = greatCircleDistance(normalizedPos, neighborCenter);
        minNeighborDist = min(minNeighborDist, dist);
    }
    
    // Edge detection threshold - adjust these values to control edge width and sharpness
    float edgeSharpness = 4.0;
    
    // If distances to current cell and nearest neighbor are similar, we're near an edge
    float edgeFactor = abs(distToCenter - minNeighborDist);
    return 1.0 - smoothstep(0.0, edgeWidth, edgeFactor * edgeSharpness);
} 