// Elevation calculation functions
// This file contains functions for calculating elevation based on H3 cells

// Function to calculate elevation at a given position on the sphere
float calculateElevation(vec3 spherePos, uint closestId, uint secondClosestId, bool applyHexJitter, float hexJitterAmount) {
    // Get the normalized position on the sphere with high precision
    vec3 normalizedPos = normalize(spherePos);
    
    // Get the closest and second closest cells' info with high precision
    vec3 closestCenter = normalize(getH3Position(float(closestId), applyHexJitter, hexJitterAmount));
    float closestDist = greatCircleDistance(normalizedPos, closestCenter);
    float closestElevation = getHexTileFloatData(float(closestId)).elevation;
    
    vec3 secondClosestCenter = normalize(getH3Position(float(secondClosestId), applyHexJitter, hexJitterAmount));
    float secondClosestDist = greatCircleDistance(normalizedPos, secondClosestCenter);
    float secondClosestElevation = getHexTileFloatData(float(secondClosestId)).elevation;
    
    // Calculate edge factor (0 deep inside a cell, 1 at the exact edge)
    float edgeFactor = 0.0;
    if (closestDist > 0.0 && secondClosestDist > 0.0) {
        edgeFactor = smoothstep(0.0, 1.0, 1.0 - abs(closestDist - secondClosestDist) / (closestDist + secondClosestDist));
    }
    
    // Use a more efficient approach with fewer loops
    // Pre-allocate arrays with fixed size for the important cells
    const int MAX_CELLS = 8;  // Closest + second closest + up to 6 first-ring neighbors
    uint cellIds[MAX_CELLS];
    float distsToCells[MAX_CELLS];
    float elevations[MAX_CELLS];
    
    // Start with the closest and second closest cells
    int numCells = 0;
    float minDist = closestDist;
    float maxDist = closestDist;
    
    // Add closest cell
    cellIds[0] = closestId;
    distsToCells[0] = closestDist;
    elevations[0] = closestElevation;
    numCells = 1;
    
    // Add second closest if valid
    if (secondClosestId != 0u && secondClosestId != closestId) {
        cellIds[1] = secondClosestId;
        distsToCells[1] = secondClosestDist;
        elevations[1] = secondClosestElevation;
        numCells = 2;
        
        minDist = min(minDist, secondClosestDist);
        maxDist = max(maxDist, secondClosestDist);
    }
    
    // Efficiently add important neighbors (unrolled loop for first few neighbors)
    // This replaces the nested loops in the original code
    for (int i = 0; i < 6 && numCells < MAX_CELLS; i++) {
        uint neighborId = getNeighborH3Id(float(closestId), float(i));
        
        // Skip invalid or already added cells
        bool skipNeighbor = (neighborId == 0u || neighborId == closestId || neighborId == secondClosestId);
        
        // Check if already exists (unrolled for small maximum size)
        for (int j = 0; j < numCells && !skipNeighbor; j++) {
            skipNeighbor = skipNeighbor || (cellIds[j] == neighborId);
        }
        
        if (!skipNeighbor) {
            vec3 neighborCenter = normalize(getH3Position(float(neighborId), applyHexJitter, hexJitterAmount));
            float dist = greatCircleDistance(normalizedPos, neighborCenter);
            
            cellIds[numCells] = neighborId;
            distsToCells[numCells] = dist;
            elevations[numCells] = getHexTileFloatData(float(neighborId)).elevation;
            
            minDist = min(minDist, dist);
            maxDist = max(maxDist, dist);
            
            numCells++;
        }
    }
    
    // Ensure we don't divide by zero
    maxDist = max(maxDist, 0.0001);
    minDist = max(minDist, 0.00001);
    float distRange = maxDist - minDist;
    
    // Combined interpolation in a single pass
    float sigma = distRange * 0.3; // Gaussian parameter
    
    float totalWeightIDW = 0.0;
    float weightedElevationIDW = 0.0;
    float totalWeightGaussian = 0.0;
    float weightedElevationGaussian = 0.0;
    
    // Single loop for both interpolation methods
    for (int i = 0; i < numCells; i++) {
        float normalizedDist = (distsToCells[i] - minDist) / distRange;
        
        // Inverse distance weighting
        float weightIDW = pow(1.0 - normalizedDist, 4.0);
        weightedElevationIDW += elevations[i] * weightIDW;
        totalWeightIDW += weightIDW;
        
        // Gaussian interpolation
        float weightGaussian = exp(-0.5 * pow(distsToCells[i] / sigma, 2.0));
        weightedElevationGaussian += elevations[i] * weightGaussian;
        totalWeightGaussian += weightGaussian;
    }
    
    // Calculate both interpolation results
    float basicElevation = (totalWeightIDW > 0.0) ? weightedElevationIDW / totalWeightIDW : closestElevation;
    float gaussianElevation = (totalWeightGaussian > 0.0) ? weightedElevationGaussian / totalWeightGaussian : closestElevation;
    
    // Edge-aware blending
    float edgeWeight = smoothstep(0.2, 0.8, edgeFactor);
    float gaussianBlend = mix(0.5, 0.9, edgeWeight);
    
    // Final blended elevation
    return mix(basicElevation, gaussianElevation, gaussianBlend);
}

// Function to get elevation at a position on the sphere
float getElevationAtPosition(vec3 spherePos, bool applyHexJitter, float hexJitterAmount) {
    // Get the H3 identifier for the current position
    vec3 sphereDirection = normalize(spherePos - uOffset);
    uint currentId = getH3IdentifierCube(sphereDirection);
    
    // Find the closest and second closest cells
    vec2 closestAndSecondClosest = findClosestAndSecondClosestCell(spherePos, currentId, applyHexJitter, hexJitterAmount);
    uint closestId = uint(closestAndSecondClosest.x);
    uint secondClosestId = uint(closestAndSecondClosest.y);
    
    // Calculate elevation using the extracted function
    return calculateElevation(spherePos, closestId, secondClosestId, applyHexJitter, hexJitterAmount);
} 