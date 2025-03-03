// Hex tile data structures and functions

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
    float elevation;
};

float validateHexTileFloatData(float tileIndex) {
    vec2 textureSize = vec2(textureSize(hexTileFloatBuffer, 0));
    vec2 uv = getHexTileUV(tileIndex, textureSize);
    vec4 data = texture2D(hexTileFloatBuffer, uv);
    return data.a;
}

HexTileFloatData getHexTileFloatData(float tileIndex) {
    vec2 textureSize = vec2(textureSize(hexTileFloatBuffer, 0));
    vec2 uv = getHexTileUV(tileIndex, textureSize);
    vec4 data = texture2D(hexTileFloatBuffer, uv);
    
    HexTileFloatData result;
    result.evapotranspiration = data.r;
    result.annualPrecipitation = data.g * 5000.0; // Denormalize from 0-1 to 0-5000
    result.annualTemperature = data.b * 100.0 - 50.0; // Denormalize from 0-1 to -50 to +50
    result.elevation = data.a;
    
    return result;
} 