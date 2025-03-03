// Grid rendering functions

float getGrid(vec2 localPosition, float size, float thickness) {
    vec2 r = localPosition.xy / size;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = min(grid.x, grid.y) + 1.0 - thickness;
    return 1.0 - min(line, 1.0);
}

float getGridFromFloat(float localPosition, float size, float thickness) {
    float r = localPosition / size;
    float grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = grid + 1.0 - thickness;
    return 1.0 - min(line, 1.0);
}

// Edge detection for hex cells
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