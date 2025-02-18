precision highp float;

uniform samplerCube h3IndexMap;
uniform sampler2D h3NeighborMap;
uniform sampler2D h3PositionMap;
uniform sampler2D map;
uniform vec3 uOffset;
uniform float uRadius;
varying vec2 vUv;
varying vec4 vWorldPosition;
varying float vInstanceId;
// uniform mat4 uModelMatrix;  // <-- This isn't used in calculations

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

// Given a float-based index, compute the UV coordinate and fetch the X, Y, Z center.
// This version uses a square texture (with dimensions texDim x texDim) and a half-texel offset.
vec3 getH3Position(float h3Id) {
    // Since h3PositionMap is square, both dimensions are equal.
    float texDim = float(textureSize(h3PositionMap, 0).x);

    // Compute the column and row index based on the flat index.
    float col = mod(h3Id, texDim);
    float row = floor(h3Id / texDim);

    // Calculate UV coordinates using the center of the texel.
    vec2 uv = vec2((col + 0.5) / texDim, (row + 0.5) / texDim);
    return texture2D(h3PositionMap, uv).xyz;
}

uint getH3IdentifierCube(vec3 direction) {
    vec4 color = textureCube(h3IndexMap, direction);
    uint r = uint(floor(color.r * 255.0 + 0.5));
    uint g = uint(floor(color.g * 255.0 + 0.5));
    uint b = uint(floor(color.b * 255.0 + 0.5));
    return (r << 16) | (g << 8) | b;
}

uint findClosestCell(vec3 position, uint currentId) {
    // Add debug output for neighbor counts
    int validNeighbors = 0;
    for(int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(currentId), float(i));
        if(neighborId != 0u) validNeighbors++;
    }
    if(validNeighbors < 3) { // Hex cells should have 5-6 neighbors
        return currentId; // Might indicate bad neighbor data
    }
    
    uint closestId = currentId;
    float minDist = 1e10;
    
    vec3 center = getH3Position(float(currentId));
    float dist = distance(position, center);
    if(dist < minDist) {
        minDist = dist;
        closestId = currentId;
    }
    
    for(int i = 0; i < 6; i++) {
        uint neighborId = getNeighborH3Id(float(currentId), float(i));
        if(neighborId == 0u) continue;
        vec3 neighborCenter = getH3Position(float(neighborId));
        float nDist = distance(position, neighborCenter);
        if(nDist < minDist) {
            minDist = nDist;
            closestId = neighborId;
        }
    }
    
    return closestId;
}

void main() {
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    vec3 direction = normalize(worldPos);
    
    uint currentId = getH3IdentifierCube(direction);
    // float fIndex = float(currentId);
    vec2 texSize = vec2(textureSize(h3PositionMap, 0));
    float fIndex = mod(float(currentId), texSize.x * texSize.y);
    vec3 center = getH3Position(fIndex);
    vec3 centerWorld = uOffset + center * uRadius;

    // Just to see if positions vary across the sphere
    gl_FragColor = vec4(center * 0.5 + 0.5, 1.0);

    if (fIndex < 0.0 || fIndex >= texSize.x * texSize.y) {
        gl_FragColor = vec4(vec3(1.0, 0.0, 0.0), 1.0);
    }

    // float radiusCheck = abs(length(center) - 1.0);
    // if (radiusCheck > 0.01) {
    //     // highlight in red if the center isn't close to the unit sphere
    //     gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    //     return;
    // }
    // gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);

    // float pattern = mod(fIndex, 256.0) / 256.0;
    // gl_FragColor = vec4(pattern, pattern, pattern, 1.0);


  
    // vec3 color = center * 0.5 + 0.5; // Visualize positions
    // gl_FragColor = vec4(color, 1.0);

    
    // Debug: Just show the raw center position
    // gl_FragColor = vec4(center, 1.0);

    // Debug: show direction to center
    // vec3 toCenter = normalize(centerWorld - spherePos);
    // gl_FragColor = vec4(toCenter * 0.5 + 0.5, 1.0);


    // vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    // vec3 spherePos = uOffset + normalize(worldPos - uOffset) * uRadius;
    // vec3 direction = normalize(worldPos);
    
    // uint currentId = getH3IdentifierCube(direction);
    // vec3 center = getH3Position(float(currentId));
    // vec3 centerWorld = uOffset + center * uRadius;

    // vec2 rootUV = vec2(0.0); // (your getCubeUV call here)
    
    // float dist = distance(spherePos, centerWorld);
    // float centerMask = 1.0 - smoothstep(0.0, 0.2, dist / uRadius);
    // // Debug color: red where fragment is near the cell center.
    // vec3 color = mix(vec3(rootUV, 1.0), vec3(1.0, 0.0, 0.0), centerMask);
    // color = vec3(dist / uRadius);

    // if (dist < 0.01) {
    //     color = vec3(1.0, 1.0, 0.0);
    // }

    // gl_FragColor = vec4(color, 1.0);

    // Temporary debug output: show index pattern
    // float pattern = mod(float(currentId), 16.0)/16.0;
    // gl_FragColor = vec4(pattern, pattern, pattern, 1.0);
    
    // Or show color-coded indices
    // vec3 indexColor = vec3(float(currentId)/255.0, 0.0, 0.0);
    // gl_FragColor = vec4(indexColor, 1.0);

    // Temporary: Visualize raw position values
    // gl_FragColor = vec4(center * 0.5 + 0.5, 1.0); // Should show sphere positions

    // Comment out the red validation check
    // float centerMag = length(center);
    // float sphereMag = length(spherePos - uOffset);
    // if(abs(centerMag - 1.0) > 0.01 || abs(sphereMag - uRadius) > 0.01) {
    //     gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    //     return;
    // }

    // Comment out the radius visualization
    // gl_FragColor = vec4(vec3(uRadius/6371007.2), 1.0);
}