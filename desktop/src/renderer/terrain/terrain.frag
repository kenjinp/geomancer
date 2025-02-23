uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform sampler2D map;
uniform usampler2D hexTileIntBuffer;
uniform sampler2D hexTileFloatBuffer;
uniform vec3 uOffset;
uniform float uRadius;
varying vec2 vUv;
varying vec4 vWorldPosition;
varying float vInstanceId;

// Add these noise functions near the top of the file
vec2 random2(float n) {
    vec2 s = vec2(n);
    return -1.0 + 2.0 * fract(sin(vec2(dot(s,vec2(127.1,311.7)),
                                     dot(s,vec2(269.5,183.3))))*43758.5453123);
}

vec3 jitterPosition(vec3 position, float seed, float amount) {
    // Get a random offset direction
    vec2 rand = random2(seed);
    vec3 tangent = normalize(cross(position, vec3(0.0, 1.0, 0.0)));
    vec3 bitangent = normalize(cross(position, tangent));
    
    // Apply jitter in tangent space
    return normalize(position + (tangent * rand.x + bitangent * rand.y) * amount);
}


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

    vec3 position = texture2D(h3PositionMap, uv).xyz;
    
    return position;
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

vec2 findClosestAndSecondClosestCell(vec3 position, uint initialId) {
    vec3 normalizedPos = normalize(position);
    vec3 initialCenter = normalize(getH3Position(float(initialId)));
    float minDist = greatCircleDistance(normalizedPos, initialCenter);
    float secondMinDist = 1000.0;
    uint closestId = initialId;
    uint secondClosestId = initialId;
    
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
    }
    
    return vec2(float(closestId), float(secondClosestId));
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
    // float edgeWidth = 0.0006;
    float edgeSharpness = 4.0;
    
    // If distances to current cell and nearest neighbor are similar, we're near an edge
    float edgeFactor = abs(distToCenter - minNeighborDist);
    return 1.0 - smoothstep(0.0, edgeWidth, edgeFactor * edgeSharpness );
}

// Get texture coordinates for a hex tile index
vec2 getHexTileUV(float tileIndex, vec2 textureSize) {
    float row = floor(tileIndex / textureSize.x);
    float col = mod(tileIndex, textureSize.x);
    
    return vec2(
        (col + 0.5) / textureSize.x,
        (row + 0.5) / textureSize.y
    );
}

// Retrieve integer data for a hex tile
struct HexTileIntData {
    uint tectonicPlate;
    uint crustData;
    uint biomeData;
    uint reserved;
};

HexTileIntData getHexTileIntData(float tileIndex) {
    vec2 textureSize = vec2(textureSize(hexTileIntBuffer, 0));
    vec2 uv = getHexTileUV(tileIndex, textureSize);
    uvec4 rawData = texture(hexTileIntBuffer, uv);
    
    HexTileIntData result;
    result.tectonicPlate = rawData.r;
    result.crustData = rawData.g;
    result.biomeData = rawData.b;
    result.reserved = rawData.a;
    
    return result;
}

// Decode crust type (0 = oceanic, 1 = continental)
bool isOceanicCrust(uint crustData) {
    return (crustData / 10u) == 0u;
}

// Decode crust subtype (0-6)
uint getCrustSubtype(uint crustData) {
    return crustData % 10u;
}

// Decode biome type and hotspot
uint getBiomeType(uint biomeData) {
    return biomeData >> 1u;
}

bool hasHotspot(uint biomeData) {
    return (biomeData & 1u) == 1u;
}

// Retrieve float data for a hex tile
struct HexTileFloatData {
    float evapotranspiration;
    float annualPrecipitation;
    float annualTemperature;
    float reserved;
};

HexTileFloatData getHexTileFloatData(float tileIndex) {
    vec2 textureSize = vec2(textureSize(hexTileFloatBuffer, 0));
    vec2 uv = getHexTileUV(tileIndex, textureSize);
    vec4 data = texture2D(hexTileFloatBuffer, uv);
    
    HexTileFloatData result;
    result.evapotranspiration = data.r;
    result.annualPrecipitation = data.g * 5000.0; // Denormalize from 0-1 to 0-5000
    result.annualTemperature = data.b * 100.0 - 50.0; // Denormalize from 0-1 to -50 to +50
    result.reserved = data.a;
    
    return result;
}

void main() {
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    
    uint currentId = getH3IdentifierCube(sphereDirection);
    vec2 closestAndSecondClosest = findClosestAndSecondClosestCell(spherePos, currentId);
    uint closestId = uint(closestAndSecondClosest.x);
    uint secondClosestId = uint(closestAndSecondClosest.y);


    // Get the base cell color
    vec3 currentCellColor = hashFloat(float(currentId));

    // Get the base cell color
    vec3 cellColor = hashFloat(float(closestId));
    
    // Get the tile data for the closest hex
    HexTileIntData intData = getHexTileIntData(float(closestId));
    HexTileFloatData floatData = getHexTileFloatData(float(closestId));

    HexTileIntData secondIntData = getHexTileIntData(float(secondClosestId));
    HexTileFloatData secondFloatData = getHexTileFloatData(float(secondClosestId));

    vec3 baseColor = vec3(hashFloat(float(intData.tectonicPlate)));

    if (intData.tectonicPlate == 0u) {
        baseColor = vec3(1.0, 1.0, 0.0);
    }

    // get Second closest neighbor
    
    // // Example: Color based on crust type and temperature
    // vec3 baseColor = isOceanicCrust(intData.crustData) ? 
    //     vec3(0.0, 0.0, 0.8) :  // Ocean blue
    //     vec3(0.4, 0.3, 0.2);   // Continental brown
    
    // // Modify color based on temperature
    // float tempFactor = (floatData.annualTemperature + 50.0) / 100.0; // 0-1
    // vec3 finalColor = mix(baseColor * 0.5, baseColor, tempFactor);
    
    // Add hotspot indicator
    // if (hasHotspot(intData.biomeData)) {
    //     finalColor += vec3(0.2, 0.0, 0.0);
    // }

    // get the closest neighbor

    vec3 edgeColor = vec3(0.0, 0.0, 0.0);
    bool isEdge = intData.tectonicPlate != secondIntData.tectonicPlate;
    float edgeWidth = 0.0006;
    // If neighbor cell has a different tectonic plate, color the edge
    if (isEdge) {
        edgeColor = vec3(1.0, 0.0, 0.0);
        edgeWidth = 0.002;
    }


    // Apply edge effect
    float edge = getEdgeFactor(spherePos, closestId, edgeWidth);
    vec3 finalColor = mix(baseColor, edgeColor, edge);
    finalColor = mix(finalColor, hashFloat(vInstanceId), 0.0);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
