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
    vec2 arcticCircleLines = vec2(90.- - axialTilt, - (90.- - axialTilt));
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

    // Calculate surface normal and apply lighting
    // apply lighting as if it's coming from 15 degrees north of the equator
    vec3 surfaceNormal = calculateSurfaceNormal(spherePos, closestId);
    
    if (getMapLayer(2u)) {
       // I tihnk this might be where the lighting should go???
    }

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

    
