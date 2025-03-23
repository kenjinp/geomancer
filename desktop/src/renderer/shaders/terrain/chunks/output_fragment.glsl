     // Uniforms for jitter control - can be modified from JavaScript

    
    // Initialize with default values if uniforms aren't set
    float hexJitterAmount = uHexJitterAmount > 0.0 ? uHexJitterAmount : 0.02;
    bool applyHexJitter = uApplyHexJitter;
   
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    
    uint currentId = getH3IdentifierCube(sphereDirection);

    vec2 closestAndSecondClosest = findClosestAndSecondClosestCell(spherePos, currentId, applyHexJitter, hexJitterAmount);
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
        
        // Get the closest and second closest cells' info with high precision
        vec3 closestCenter = normalize(getH3Position(float(closestId), applyHexJitter, hexJitterAmount));
        float closestDist = greatCircleDistance(normalizedPos, closestCenter);
        float closestElevation = floatData.elevation;
        
        vec3 secondClosestCenter = normalize(getH3Position(float(secondClosestId), applyHexJitter, hexJitterAmount));
        float secondClosestDist = greatCircleDistance(normalizedPos, secondClosestCenter);
        float secondClosestElevation = secondFloatData.elevation;
        
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

        float n = fbm3(spherePos);
        
        // Final blended elevation
        elevation = mix(basicElevation, gaussianElevation, gaussianBlend);

        // Calculate coastalNess - approaches 1 when elevation is close to 0
        // float coastalNess = exp(-elevation * 20.0); // Exponential falloff from elevation 0
        // elevation = elevation + (n * 0.001 * coastalNess);
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
    if (getMapLayer(6u)) {
      // this says coastalness but it's really just a high pass filter for low elevations
      // we really want a distance field to the oceans
      float coastalNess = exp(-abs(elevation) * 200.0); 
      baseColor = mix(baseColor, vec3(0.0, 1.0, 1.0), coastalNess);
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
        edge = getEdgeFactor(spherePos, closestId, applyHexJitter, hexJitterAmount, edgeWidth);
    }

    vec3 finalColor = mix(combinedGridColors, edgeColor, edge);
    finalColor = mix(finalColor, hashFloat(vInstanceId), 0.0);
    
    diffuseColor.rgb = finalColor;

    if (!getMapLayer(2u)) {
      gl_FragColor = vec4(diffuseColor.rgb, 1.0);
      return;
    }

    
