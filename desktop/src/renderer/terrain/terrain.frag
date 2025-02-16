uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
varying vec4 vWorldPosition;
uniform vec3 uOffset;
varying float vInstanceId;
uniform mat4 uModelMatrix;
uniform float uRadius;

uint getNeighborH3Id(float baseId, float direction) {
    float index = baseId * 6.0 + direction;
    vec2 texSize = vec2(textureSize(h3NeighborMap, 0));
    vec2 uv = vec2(
        mod(index, texSize.x) / texSize.x,
        floor(index / texSize.x) / texSize.y
    );
    vec4 packed = texture2D(h3NeighborMap, uv) * 255.0;
    return (uint(packed.r) << 8) | uint(packed.g);
}

vec3 getH3Position(float h3Id) {
    vec2 texSize = vec2(textureSize(h3PositionMap, 0));
    vec2 uv = vec2(
        mod(h3Id, texSize.x) / texSize.x, 
        floor(h3Id / texSize.x) / texSize.y
    );
    return texture2D(h3PositionMap, uv).xyz;
}

int getCubeFaceIndex(vec3 direction) {
    vec3 absDir = abs(direction);
    float maxComponent = max(absDir.x, max(absDir.y, absDir.z));
    
    if (absDir.x == maxComponent) {
        return direction.x > 0.0 ? 0 : 1; // +X or -X
    } else if (absDir.y == maxComponent) {
        return direction.y > 0.0 ? 4 : 5; // +Y or -Y
    } else {
        return direction.z > 0.0 ? 2 : 3; // +Z or -Z
    }
}

vec2 getCubeUV(vec3 direction) {
    // Determine dominant face
    vec3 absDir = abs(normalize(direction));
    float maxComponent = max(absDir.x, max(absDir.y, absDir.z));
    
    // Project direction onto cube face
    vec3 projected = direction / maxComponent;
    vec2 uv;
    
    if (absDir.x == maxComponent) { // X-facing
        uv = vec2(
            projected.z * sign(direction.x),
            projected.y
        );
    } else if (absDir.y == maxComponent) { // Y-facing
        uv = vec2(
            projected.x,
            projected.z * sign(direction.y)
        );
    } else { // Z-facing
        uv = vec2(
            projected.x * sign(direction.z),
            projected.y
        );
    }
    
    // Convert from [-1,1] to [0,1] UV space
    uv = uv * 0.5 + 0.5;
    
    // Adjust for cube texture layout (6 faces arranged horizontally)
    float faceIndex = float(getCubeFaceIndex(direction));
    uv.x = (uv.x + faceIndex) / 6.0;
    
    return uv;
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
        if(neighborId == 0u) continue; // Skip invalid
        
        vec3 neighborCenter = getH3Position(float(neighborId));
        float neighborDist = distance(position, neighborCenter);
        if(neighborDist < minDist) {
            minDist = neighborDist;
            closestId = neighborId;
        }
    }
    
    return closestId;
}

// Hexagon distance function
float hexDist(vec2 p) {
  p = abs(p);
  return max(p.x * 0.866025 + p.y * 0.5, p.y);
}

vec3 getH3Color(uint h3Index) {
  // Your existing random color implementation
    // Improved hash with better bit mixing
  uint h = h3Index;
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;

  // Convert to HSV with controlled variance
  float hue = float(h % 360u) / 360.0;
  float sat = 0.65 + float((h >> 8u) % 10u) * 0.035;
  float val = 0.5 + float((h >> 16u) % 8u) * 0.0625;
  
  // HSV to RGB conversion with gamma correction
  vec3 rgb = clamp(abs(mod(hue*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
  rgb = pow(mix(vec3(1.0), rgb, sat) * val, vec3(2.2));
  return rgb;
}

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

uint getH3IdentifierCube(vec3 direction) {
    // Sample directly from cube map using direction vector
    vec4 packed = textureCube(h3IndexMap, direction) * 255.0;
    return (uint(packed.r) << 16) | 
           (uint(packed.g) << 8) | 
            uint(packed.b);
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

float metersToNormalized(float meters) {
    return meters / (uRadius * 2.0); // Convert meters to 0-1 range
}

void main() {
    // Get precise world position using inverse projection
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    
    // For sphere projection (if needed):
    vec3 spherePos = uOffset + normalize(worldPos - uOffset) * uRadius;
    
    // Use either worldPos or spherePos depending on your needs
    vec3 direction = normalize(spherePos - uOffset);
    
    uint currentId = getH3IdentifierCube(direction);

    vec3 center = getH3Position(float(currentId));
    float dist = distance(spherePos, center);

    // Get actual radius from uniform
    float actualRadius = uRadius;
    
    // H3 resolution 4 parameters (25km edge length)
    float cellEdgeMeters = 25000.0; 
    float gridSpacingMeters = 2000.0; // 5km grid
    
    // Convert to normalized units
    float cellEdgeLength = metersToNormalized(cellEdgeMeters);
    float gridSpacing = metersToNormalized(gridSpacingMeters);
    
    // Visualization parameters
    float maxVisibleDist = cellEdgeLength * 0.5;
    
    // Normalize distance
    float normalizedDist = clamp(dist / maxVisibleDist, 0.0, 1.0);
    
    // Color mapping
    vec3 color = vec3(1.0 - normalizedDist);
    
    // Grid pattern (5km intervals)
    float grid = 1.0 - smoothstep(0.02, 0.03, fract(dist / gridSpacing));
    color = mix(color, vec3(0.0, 1.0, 0.0), grid * 0.5);
    
    // Center markers (25m radius)
    float centerMask = 1.0 - smoothstep(
        metersToNormalized(20.0), 
        metersToNormalized(30.0), 
        dist
    );
    color = mix(color, vec3(1.0, 0.0, 0.0), centerMask);
    
    // Temporary debug: show raw position values
    vec3 rawPos = getH3Position(float(currentId));
    
    // Temporary: Distance visualization
    float scaledDist = dist * 100.0; // Scale for visibility
    vec3 tempColor = vec3(fract(scaledDist)); // Stripes every 0.01 units
    
    // Mix with position debug
    color = mix(
        color,
        tempColor,
        0.5
    );
    
    // Check for invalid positions (should be rare)
    if(length(rawPos) < 0.01) {
        color = vec3(1.0, 1.0, 0.0);
    }
    
    gl_FragColor = vec4(color, 1.0);
}
