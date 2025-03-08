// Uniforms
uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform sampler2D map;
uniform usampler2D hexTileIntBuffer;
uniform sampler2D hexTileFloatBuffer;
uniform vec3 uOffset;
uniform float uRadius;
uniform float uSelectedTile;
uniform uint uMapMode;
uniform uint uMapLayers;

// Include external color utilities
#include "../../../lib/cartography/colors.glsl"

// Include our modular shader components
#include "./utils/math.glsl"
#include "./utils/latlong.glsl"
#include "./utils/layers.glsl"
#include "./noise/random.glsl"
#include "./h3/h3.glsl"
#include "./h3/hextile.glsl"
#include "./grid/grid.glsl"
#include "./lighting/lighting.glsl"


// Varyings
varying vec2 vUv;
varying vec4 vWorldPosition;
varying float vInstanceId;

void main() {
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    
    uint currentId = getH3IdentifierCube(sphereDirection);

    vec2 closestAndSecondClosest = findClosestAndSecondClosestCell(spherePos, currentId);
    uint closestId = uint(closestAndSecondClosest.x);
    uint secondClosestId = uint(closestAndSecondClosest.y);

    // Get lat/lon information
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

    // Set base color based on map mode
    vec3 baseColor = vec3(0.3);

    if (uMapMode == 1u) {
        baseColor = getColorForElevation(remap(elevation, -1.0, 1.0, -8000.0, 8000.0)).rgb;
    }
    if (uMapMode == 2u) {
        baseColor = vec3(hashFloat(float(intData.tectonicPlate)));
    }
    if (uMapMode == 3u) {
        baseColor = cellColor;
    }

    // Check if grid should be shown
    float showGrid = 0.0;
    if (getMapLayer(1u)) {
        showGrid = 1.0;
    }

    // Define constants for grid lines
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
    
    // Draw lat/long grid
    float grid = getGrid(latlongUVWithReps, 1.0, lineWidth) * uLatLongGridAlpha;
    float grid2 = getGrid(latlongUVWithReps, 0.5, lineWidth) * uSubgridAlpha;
    float grid3 = getGrid(latlongUVWithReps, 0.1, lineWidth) * uSubgridAlpha;
    float combinedGrid = (grid + grid2 + grid3) * showGrid;

    // Apply lighting if enabled
    vec3 lightDir = normalize(vec3(1.0, 0.4, 0.0)); 
    // vec3 normal = calculateSurfaceNormal(spherePos, closestId);
    
    // if (getMapLayer(2u)) {
    //     // Apply lighting to the base color before adding grid lines and edges
    //     baseColor = applyLighting(baseColor, normal, lightDir);
    // }

    vec3 whiteGridColors = mix(baseColor, vec3(1.0), combinedGrid);

    // Draw globe grid
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

    // Highlight selected tile
    if (uSelectedTile > -1.0 && uSelectedTile == float(closestId)) {
        combinedGridColors = vec3(1.0, 0.0, 0.0);
    }

    // Apply edge effect for plate boundaries
    vec3 edgeColor = vec3(0.0, 0.0, 0.0);
    bool isEdge = intData.tectonicPlate != secondIntData.tectonicPlate;
    float edgeWidth = 0.0006;
    
    float edge = 0.0;
    if (getMapLayer(0u)) {
        edge = getEdgeFactor(spherePos, closestId, edgeWidth);
    }

    vec3 finalColor = mix(combinedGridColors, edgeColor, edge);
    finalColor = mix(finalColor, hashFloat(vInstanceId), 0.0);

    // Ensure proper depth handling and no color bleeding
    gl_FragColor = vec4(finalColor, 1.0);
} 