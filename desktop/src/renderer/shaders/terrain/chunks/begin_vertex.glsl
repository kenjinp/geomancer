// Original position
vec3 transformed = vec3( position );
vInstanceId = float(gl_InstanceID);
vOriginalPosition = position; 

// THIS STUFF DOESNT WORK IGNORE IT
// Vertex elevation displacement
// Only apply elevation if the elevation layer is enabled
// if (getMapLayer(5u)) { // Check if elevation layer is enabled
//     // Calculate world position and sphere direction
//     vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
//     vec3 sphereDir = normalize(worldPos.xyz - uOffset);
    
//     // Get H3 identifier (uses cross-compatible cube texture sampling for vertex shaders)
//     uint currentId = getH3IdentifierVertex(sphereDir);
    
//     // Only proceed if we got a valid H3 identifier
//     if (currentId != 0u) {
//         // Get elevation data from the hex tile buffer
//         HexTileFloatData floatData = getHexTileFloatData(float(currentId));
//         float elevation = floatData.elevation;
        
//         // Apply elevation displacement along the sphere normal
//         // Scale the elevation to a reasonable range for the sphere
//         float elevationScale = 1.0; // Reduced scale for testing
//         vec3 elevatedPosition = position + sphereDir * elevation * elevationScale;
        
//         // Update the transformed position
//         transformed = elevatedPosition;
//     } else {
//       transformed = position + sphereDir * 100000.0;
//     }
// } 