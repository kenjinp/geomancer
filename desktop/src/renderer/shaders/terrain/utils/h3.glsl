// H3 utility functions

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

    vec3 position = texture2D(h3PositionMap, uv).xyz;
    
    return position;
}

uint getH3IdentifierCube(vec3 direction) {
    vec4 color = textureCube(h3IndexMap, direction);
    uint r = uint(floor(color.r * 255.0 + 0.5));
    uint g = uint(floor(color.g * 255.0 + 0.5));
    uint b = uint(floor(color.b * 255.0 + 0.5));

    // return 0u if invalid
    if (r == 255u && g == 255u && b == 255u) {
        return 0u;
    }

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

vec2 findClosestAndSecondClosestCell(vec3 position, uint initialId) {
    vec3 normalizedPos = normalize(position);
    vec3 initialCenter = normalize(getH3Position(float(initialId)));
    float minDist = greatCircleDistance(normalizedPos, initialCenter);
    float secondMinDist = 1000.0;
    uint closestId = initialId;
    uint secondClosestId = initialId;
    float maxDist = 0.0;
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(initialId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId)));
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

float getEdgeFactor(vec3 position, uint cellId, float edgeWidth) {
    vec3 normalizedPos = normalize(position);
    vec3 cellCenter = normalize(getH3Position(float(cellId)));
    float distToCenter = greatCircleDistance(normalizedPos, cellCenter);
    
    // Check distance to all neighbors
    float minNeighborDist = 1000.0;
    for (int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(cellId), float(i));
        if (neighborId == 0u) continue;
        
        vec3 neighborCenter = normalize(getH3Position(float(neighborId)));
        float dist = greatCircleDistance(normalizedPos, neighborCenter);
        minNeighborDist = min(minNeighborDist, dist);
    }
    
    // Edge detection threshold - adjust these values to control edge width and sharpness
    float edgeSharpness = 4.0;
    
    // If distances to current cell and nearest neighbor are similar, we're near an edge
    float edgeFactor = abs(distToCenter - minNeighborDist);
    return 1.0 - smoothstep(0.0, edgeWidth, edgeFactor * edgeSharpness);
} 