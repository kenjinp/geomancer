    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    
    uint currentId = getH3IdentifierCube(sphereDirection);

    vec2 closestAndSecondClosest = findClosestAndSecondClosestCell(spherePos, currentId);
    uint closestId = uint(closestAndSecondClosest.x);
    uint secondClosestId = uint(closestAndSecondClosest.y);

    // lat lon stuff
    LatLong latlong = getLatLong(worldPos, uRadius);
    float lineWidth = 1.0;
    float latRepititions = 18.;
    float lonRepititions = 36.;
    vec2 latlongUV = vec2(
        -remap(latlong.lat, -90., 90., 0., 1.),
        remap(latlong.lon, -180., 180., 0., 1.)
    );
    vec2 latlongUVWithReps = vec2(
        latlongUV.x * latRepititions,
        latlongUV.y * lonRepititions
    );

    // Get the base cell color
    vec3 currentCellColor = hashFloat(float(currentId));
    vec3 cellColor = hashFloat(float(closestId));
    
    // Get the tile data for the closest hex
    HexTileIntData intData = getHexTileIntData(float(closestId));
    HexTileFloatData floatData = getHexTileFloatData(float(closestId));

    HexTileIntData secondIntData = getHexTileIntData(float(secondClosestId));
    HexTileFloatData secondFloatData = getHexTileFloatData(float(secondClosestId));

    float elevation = floatData.elevation;
    if (getMapLayer(5u)) {

        // elevation interpolation begin
        // Get the normalized position on the sphere with high precision
        vec3 normalizedPos = normalize(spherePos);
        
        // We need to use more precise methods since this is fragment-based rendering
        // Get exact positions with high precision arithmetic
        
        // First, get the closest cell's info with high precision
        vec3 closestCenter = normalize(getH3Position(float(closestId)));
        float closestDist = greatCircleDistance(normalizedPos, closestCenter);
        float closestElevation = floatData.elevation;
        
        // Get the second closest cell's info with high precision
        vec3 secondClosestCenter = normalize(getH3Position(float(secondClosestId)));
        float secondClosestDist = greatCircleDistance(normalizedPos, secondClosestCenter);
        float secondClosestElevation = secondFloatData.elevation;
        
        // Start building weights with a higher-precision approach
        // Calculate the shared edge factor (0 deep inside a cell, 1 at the exact edge)
        float edgeFactor = 0.0;
        if (closestDist > 0.0 && secondClosestDist > 0.0) {
            // This factor rises to 1.0 at exactly the edge between cells
            edgeFactor = smoothstep(0.0, 1.0, 1.0 - abs(closestDist - secondClosestDist) / (closestDist + secondClosestDist));
        }
        
        // First collect a larger number of neighboring cells for better gradient
        const int MAX_CELLS = 19;  // Maximum cells: 1 (center) + 6 (neighbors) + 12 (ring 2 neighbors)
        uint cellIds[MAX_CELLS];
        float distsToCells[MAX_CELLS];
        float elevations[MAX_CELLS];
        
        // Start with the closest cell
        int numCells = 0;
        cellIds[numCells] = closestId;
        distsToCells[numCells] = closestDist;
        elevations[numCells] = closestElevation;
        numCells++;
        
        // Add second closest
        if (secondClosestId != 0u && secondClosestId != closestId) {
            cellIds[numCells] = secondClosestId;
            distsToCells[numCells] = secondClosestDist;
            elevations[numCells] = secondClosestElevation;
            numCells++;
        }
        
        // Add first-ring neighbors of closest cell
        for (int i = 0; i < 6; i++) {
            uint neighborId = getNeighborH3Id(float(closestId), float(i));
            if (neighborId == 0u || neighborId == closestId || neighborId == secondClosestId) continue;
            
            // Add this neighbor
            bool alreadyExists = false;
            for (int j = 0; j < numCells; j++) {
                if (cellIds[j] == neighborId) {
                    alreadyExists = true;
                    break;
                }
            }
            
            if (!alreadyExists && numCells < MAX_CELLS) {
                vec3 neighborCenter = normalize(getH3Position(float(neighborId)));
                float dist = greatCircleDistance(normalizedPos, neighborCenter);
                HexTileFloatData neighborData = getHexTileFloatData(float(neighborId));
                
                cellIds[numCells] = neighborId;
                distsToCells[numCells] = dist;
                elevations[numCells] = neighborData.elevation;
                numCells++;
            }
        }
        
        // Calculate min and max distances for normalization
        float minDist = 10.0;
        float maxDist = 0.0;
        for (int i = 0; i < numCells; i++) {
            minDist = min(minDist, distsToCells[i]);
            maxDist = max(maxDist, distsToCells[i]);
        }
        
        // Ensure we don't divide by zero
        maxDist = max(maxDist, 0.0001);
        minDist = max(minDist, 0.00001);
        
        // Multi-layer interpolation for ultra-smooth gradients
        
        // First layer: basic inverse distance weighting
        float totalWeight1 = 0.0;
        float weightedElevation1 = 0.0;
        for (int i = 0; i < numCells; i++) {
            float normalizedDist = (distsToCells[i] - minDist) / (maxDist - minDist);
            
            // Very smooth weight function for basic interpolation
            float weight = pow(1.0 - normalizedDist, 4.0);
            weightedElevation1 += elevations[i] * weight;
            totalWeight1 += weight;
        }
        float basicElevation = totalWeight1 > 0.0 ? weightedElevation1 / totalWeight1 : floatData.elevation;
        
        // Second layer: Gaussian interpolation for perfect smoothness
        float totalWeight2 = 0.0;
        float weightedElevation2 = 0.0;
        float sigma = (maxDist - minDist) * 0.3; // Adjust sigma based on cell spacing
        
        for (int i = 0; i < numCells; i++) {
            // Gaussian kernel - C∞ continuity
            float weight = exp(-0.5 * pow(distsToCells[i] / sigma, 2.0));
            weightedElevation2 += elevations[i] * weight;
            totalWeight2 += weight;
        }
        float gaussianElevation = totalWeight2 > 0.0 ? weightedElevation2 / totalWeight2 : floatData.elevation;
        
        // Final blend: combine multiple interpolation methods with edge-aware blending
        // Stronger edge detection near borders where artifacts would be visible
        float edgeWeight = smoothstep(0.2, 0.8, edgeFactor);
        
        // Higher weight to Gaussian near edges
        float gaussianBlend = mix(0.5, 0.9, edgeWeight);
        
        // Blend the two interpolation approaches
        elevation = mix(basicElevation, gaussianElevation, gaussianBlend);
    }

    vec3 baseColor = gl_FragColor.rgb;

    if (uMapMode == 1u) {

        baseColor = getColorForElevation(remap(elevation, -1.0, 1.0, -8000.0, 8000.0)).rgb;
    }
    if (uMapMode == 2u) {
        baseColor = vec3(hashFloat(float(intData.tectonicPlate)));
    }
    if (uMapMode == 3u) {
        baseColor = cellColor;
    }
    if (uMapMode == 4u) {
        baseColor = vec3(hashFloat(float(vInstanceId)));
    }
    if (getMapLayer(3u)) {
        baseColor = mix(baseColor, vec3(hashFloat(float(vInstanceId))), 0.5);
    }

    float showGrid = 0.0;
    if (getMapLayer(1u)) {
        showGrid = 1.0;
    }

    float axialTilt = 23.4;
    vec2 arcticCircleLines = vec2(90. - axialTilt, - (90. - axialTilt));
    vec2 tropicLines = vec2(axialTilt, -axialTilt);

    float uSubgridAlpha = 0.0;
    float uContourAlpha = 0.0;
    float uLatLongGridAlpha = 0.5;
    float uPolarCirclesAlpha = 1.0;
    float uTropicsAlpha = 1.0;
    float uEquatorAlpha = 1.0;
    float uPrimeMeridianAlpha = 0.8;

    // square grid
    float grid = getGrid(latlongUVWithReps, 1.0, lineWidth) * uLatLongGridAlpha;
    float grid2 = getGrid(latlongUVWithReps, 0.5, lineWidth) * uSubgridAlpha;
    float grid3 = getGrid(latlongUVWithReps, 0.1, lineWidth) * uSubgridAlpha;
    float combinedGrid = (grid + grid2 + grid3) * showGrid;

    vec3 whiteGridColors = mix(baseColor, vec3(1.0), combinedGrid);
    // globe grid
    float primeMeridian = getGridFromFloat(latlongUV.y, 0.5, lineWidth * 1.2);
    float equator = getGridFromFloat(latlongUV.x, 0.5, lineWidth * 1.2);
    float tropicCapricorn = getGridFromFloat(latlongUV.x + remap(tropicLines.x, -90., 90., 0., 1.), 1.0, lineWidth * 1.2);
    float tropicCancer = getGridFromFloat(latlongUV.x + remap(tropicLines.y, -90., 90., 0., 1.), 1.0, lineWidth * 1.2);
    float arcticCircle = getGridFromFloat(latlongUV.x + remap(arcticCircleLines.x, -90., 90., 0., 1.), 1.0 , lineWidth * 1.2);
    float antarcticCircle = getGridFromFloat(latlongUV.x + remap(arcticCircleLines.y, -90., 90., 0., 1.), 1.0, lineWidth * 1.2);
    float combinedGrid2 = primeMeridian + equator;
    float tropics = tropicCapricorn + tropicCancer;
    float polarCircles = arcticCircle + antarcticCircle;

    vec3 combinedGridColors = mix(whiteGridColors, vec3(1.0, 0.0, 0.0), combinedGrid2 * uLatLongGridAlpha * showGrid);
    combinedGridColors = mix(combinedGridColors, vec3(1.0, 1.0, 0.0), tropics * uTropicsAlpha * showGrid);
    combinedGridColors = mix(combinedGridColors, vec3(1.0, 1.0, 0.0), polarCircles * uPolarCirclesAlpha * showGrid);
    
    vec3 edgeColor = vec3(0.0, 0.0, 0.0);
    bool isEdge = intData.tectonicPlate != secondIntData.tectonicPlate;
    float edgeWidth = 0.0006;
    
    if (uSelectedTile > -1 && uSelectedTile == int(closestId)) {
        combinedGridColors = vec3(1.0, 0.0, 0.0);
    }

    // Apply edge effect
    float edge = 0.0;
    if (getMapLayer(0u)) {
        edge = getEdgeFactor(spherePos, closestId, edgeWidth);
    }

    vec3 finalColor = mix(combinedGridColors, edgeColor, edge);
    finalColor = mix(finalColor, hashFloat(vInstanceId), 0.0);
    
    diffuseColor.rgb = finalColor;

    if (!getMapLayer(2u)) {
      gl_FragColor = vec4(diffuseColor.rgb, 1.0);
      return;
    }

    
