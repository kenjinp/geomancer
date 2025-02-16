uniform samplerCube h3CubeMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;

// Get 24-bit H3 index (sufficient for resolution 4)
vec3 getH3Index(vec3 direction) {
  vec2 uv = getCubeUV(direction);
  vec3 packed = texture2D(h3CubeMap, direction).rgb * 255.0;
  return vec3(packed.r, packed.g, packed.b);
}

// Reconstruct unique identifier for resolution 4
uint getH3Identifier(vec3 direction) {
    // Sample directly from cube map using direction vector
    vec4 packed = textureCube(h3CubeMap, direction) * 255.0;
    return (uint(packed.r) << 16) | 
           (uint(packed.g) << 8) | 
            uint(packed.b);
}

// Get neighbor indices
vec2[6] getNeighbors(vec2 h3Index) {
  vec2 indexCoord = vec2(h3Index.r * 256.0 + h3Index.g) / textureSize(h3NeighborMap, 0).x;
  vec2[6] neighbors;
  for(int i=0; i<6; i++) {
    neighbors[i] = texture2D(h3NeighborMap, vec2(float(i)/6.0, indexCoord.y)).rg * 255.0;
  }
  return neighbors;
}

// Get center position
vec3 getH3Position(float h3Id) {
    vec2 texSize = vec2(textureSize(h3PositionMap, 0));
    vec2 uv = vec2(
        mod(h3Id, texSize.x) / texSize.x,
        floor(h3Id / texSize.x) / texSize.y
    );
    return texture2D(h3PositionMap, uv).xyz;
}

// Add this hash function
vec3 hashH3Id(uint h3Id) {
    // Mix the bits using XOR and shifts
    uint seed = h3Id;
    seed ^= (seed << 19u);
    seed ^= (seed >> 7u);
    seed ^= (seed << 23u);
    
    // Convert to RGB components
    return vec3(
        float((seed >> 16u) & 0xFFu) / 255.0,
        float((seed >> 8u) & 0xFFu) / 255.0,
        float(seed & 0xFFu) / 255.0
    );
}

// Updated color function
vec3 getH3Color(vec3 direction) {
    uint id = getH3Identifier(direction);
    return hashH3Id(id);
}

float hexEdgeFactor(vec3 direction, uint h3Id) {
    vec3 center = getH3Position(h3Id);
    float angle = acos(dot(normalize(direction), normalize(center)));
    return 1.0 - smoothstep(0.0, radians(0.5), angle);
}

float hexGrid(vec3 direction, float scale) {
    vec3 derivX = dFdx(direction) * scale;
    vec3 derivY = dFdy(direction) * scale;
    
    // Create hexagonal pattern in tangent space
    vec2 uv = vec2(
        dot(direction, derivX),
        dot(direction, derivY)
    );
    
    vec2 grid = abs(fract(uv - 0.5) - 0.5);
    return smoothstep(0.05, 0.1, max(grid.x, grid.y));
}

uint getNeighborH3Id(float baseId, float direction) {
    vec2 coord = vec2(direction/6.0, baseId / float(textureSize(h3NeighborMap, 0).y));
    vec2 packed = texture2D(h3NeighborMap, coord).xy * 255.0;
    return (uint(packed.x) << 16) | (uint(packed.y) << 8) | uint(packed.x);
}

uint findClosestCell(vec3 position, uint currentId) {
    uint closestId = currentId;
    float minDist = 1e10;
    
    // Check current cell
    vec3 center = getH3Position(float(currentId));
    float dist = distance(position, center);
    if(dist < minDist) {
        minDist = dist;
        closestId = currentId;
    }
    
    // Check all 6 neighbors
    for(int i=0; i<6; i++) {
        uint neighborId = getNeighborH3Id(float(currentId), float(i));
        if(neighborId == 0u) continue;
        
        vec3 neighborCenter = getH3Position(float(neighborId));
        float neighborDist = distance(position, neighborCenter);
        if(neighborDist < minDist) {
            minDist = neighborDist;
            closestId = neighborId;
        }
    }
    
    return closestId;
}

void main() {
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 direction = normalize(worldPos - uOffset);
    
    uint currentId = getH3Identifier(direction);
    uint closestId = findClosestCell(worldPos, currentId);
    
    // Visualize closest cell
    vec3 color = hashH3Id(closestId);
    gl_FragColor = vec4(color, 1.0);
}