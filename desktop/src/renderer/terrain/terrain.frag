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
    // Check for sentinel value
    if(packed.r == 255.0 && packed.g == 255.0) {
        return 0u; // Invalid neighbor
    }
    return (uint(packed.r) << 8) | uint(packed.g);
}

// Given a float-based index, compute the UV coordinate and fetch the X, Y, Z center.
// This version uses a square texture (with dimensions texDim x texDim) and a half-texel offset.
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
    
    return texture2D(h3PositionMap, uv).xyz;
}

uint getH3IdentifierCube(vec3 direction) {
    vec4 color = textureCube(h3IndexMap, direction);
    uint r = uint(floor(color.r * 255.0 + 0.5));
    uint g = uint(floor(color.g * 255.0 + 0.5));
    uint b = uint(floor(color.b * 255.0 + 0.5));
    return (r << 16) | (g << 8) | b;
}

uint findClosestCell(vec3 position, uint initialId) {
    uint currentId = initialId;
    float minDist = 1e10;
    uint lastId = 0u;
    int iterations = 0;
    
    // Iterate until we stop improving or max iterations
    while(iterations < 4 && currentId != lastId) {
        lastId = currentId;
        vec3 center = getH3Position(float(currentId));
        minDist = distance(position, center);
        uint bestNeighbor = currentId;
        
        // Check all neighbors
        for(int i = 0; i < 6; i++) {
            uint neighborId = getNeighborH3Id(float(currentId), float(i));
            if(neighborId == 0u) continue;
            
            vec3 neighborPos = getH3Position(float(neighborId));
            float dist = distance(position, neighborPos);
            
            // Track the closest neighbor in this iteration
            if(dist < minDist) {
                minDist = dist;
                bestNeighbor = neighborId;
            }
        }
        
        // Only update if we found a better neighbor
        currentId = bestNeighbor;
        iterations++;
    }
    
    return currentId;
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

float edgeFactor(vec3 worldPos, uint cellId) {
    vec3 center = getH3Position(float(cellId));
    float minAngle = 1e10;
    
    for(int i=0; i<6; i++) {
        uint neighborId = getNeighborH3Id(float(cellId), float(i));
        if(neighborId == 0u) continue;
        
        vec3 neighborPos = getH3Position(float(neighborId));
        vec3 edgeNormal = normalize(cross(center, neighborPos));
        float angle = acos(dot(normalize(worldPos), edgeNormal));
        minAngle = min(minAngle, angle);
    }
    
    return smoothstep(0.0, 0.01, minAngle);
}

void main() {
    vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    vec3 sphereDirection = normalize(worldPos - uOffset);
    vec3 spherePos = uOffset + sphereDirection * uRadius;
    vec3 direction = normalize(worldPos);
    
    uint currentId = getH3IdentifierCube(direction);
    ivec2 posTexSize = textureSize(h3PositionMap, 0);
    float maxValidIndex = float(posTexSize.x * posTexSize.y) - 1.0;
    float fIndex = clamp(float(currentId), 0.0, maxValidIndex);
    uint closestId = findClosestCell(spherePos, currentId);

    vec3 center = getH3Position(fIndex);
    vec3 centerWorld = uOffset + center * uRadius;

    // --- Debug: Paint a red circle around the hex center (10km radius) ---
    float debugCircleRadius = 23738.56;  // 25 km radius
    float edgeWidth = 20000.0;           // Width of the anti-aliased edge (adjust if needed)
    // Compute the distance from the fragment's sphere position to the hex center in world space.
    float d = distance(spherePos, centerWorld);
    // Create a mask: inside the circle (d < debugCircleRadius - edgeWidth) the mask is 1, 
    // outside (d > debugCircleRadius) the mask is 0.
    float circleMask = 1.0 - smoothstep(debugCircleRadius - edgeWidth, debugCircleRadius, d);

    // Get the base color from the hex center (for instance, as visualized previously).
    // vec4 debugBaseColor = mix(vec4(hashFloat(fIndex), 1.0), vec4(1.0), 0.9);
    // vec4 debugRedColor = vec4(hashFloat(fIndex), 1.0);
    // vec4 baseColor = mix(debugBaseColor, debugRedColor, circleMask);
    // vec4 redColor = vec4(hashFloat(fIndex), 1.0);
    // // Mix the base color with red according to the mask.
    // gl_FragColor = mix(baseColor, redColor, circleMask);

    // gl_FragColor = vec4(hashFloat(float(closestId)), 1.0);

    // if (closestId != currentId) {
    //     gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
    // }

    // Visualize position validity
    // float isValid = length(center) > 0.9 ? 1.0 : 0.0;
    // gl_FragColor = mix(vec4(1.0,0.0,0.0,1.0), gl_FragColor, isValid);

    // Temporary debug: show raw position values
    // vec3 pos = texture2D(h3PositionMap, vec2(gl_FragCoord.x/1024.0, gl_FragCoord.y/1024.0)).xyz;
    // gl_FragColor = vec4(pos * 0.5 + 0.5, 1.0);
    
    // Or check if positions are unit length
    // float len = length(center);
    // if(abs(len - 1.0) > 0.01) {
    //     gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    // }

    // Additional check (if needed) to ensure the center lies on the unit sphere.
    // float radiusCheck = abs(length(center) - 1.0);
    // if (radiusCheck > 0.01) {
    //     gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    //     return;
    // }

    // // float pattern = mod(fIndex, 256.0) / 256.0;
    // // gl_FragColor = vec4(pattern, pattern, pattern, 1.0);



    // // Debug: show direction to center
    // // vec3 toCenter = normalize(centerWorld - spherePos);
    // // gl_FragColor = vec4(toCenter * 0.5 + 0.5, 1.0);


    // // vec3 worldPos = vWorldPosition.xyz / vWorldPosition.w;
    // // vec3 spherePos = uOffset + normalize(worldPos - uOffset) * uRadius;
    // // vec3 direction = normalize(worldPos);
    
    // // uint currentId = getH3IdentifierCube(direction);
    // // vec3 center = getH3Position(float(currentId));
    // // vec3 centerWorld = uOffset + center * uRadius;

    // vec2 rootUV = vec2(0.0); // (your getCubeUV call here)
    
    // float dist = distance(spherePos, centerWorld);
    // float centerMask = 1.0 - smoothstep(0.0, 0.2, dist / uRadius);
    // // // Debug color: red where fragment is near the cell center.
    // vec3 color = mix(vec3(rootUV, 1.0), vec3(1.0, 0.0, 0.0), centerMask);
    // color = vec3(dist / uRadius);

    // // if (dist < 0.01) {
    // //     color = vec3(1.0, 1.0, 0.0);
    // // }

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

    // Visualize cube map face orientation
    vec3 color = vec3(0);
    if (abs(direction.y) > 0.8) color = vec3(1,0,0); // Red near poles
    if (abs(direction.x) > 0.8) color = vec3(0,1,0); // Green on X faces
    // now blue on the z axis
    if (abs(direction.z) > 0.8) color = vec3(0,0,1);
    gl_FragColor = mix(gl_FragColor, vec4(color, 1.0), 0.3);

    // edgeFactor

    // Get base color
    vec3 baseColor = hashFloat(float(closestId));
    
    // Calculate edge factor
    float edgeDist = edgeFactor(spherePos, closestId);
    
    // Apply anti-aliased edges
    vec3 finalColor = mix(baseColor, vec3(0.1), vec3(edgeDist));
    
    // Add center highlight
    float centerMask = 1.0 - smoothstep(0.0, 0.01, d / uRadius);
    finalColor = mix(finalColor, vec3(1,1,0), centerMask * 0.5);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
