#include <shadowmap_pars_vertex>

// Start with standard vertex projection
vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );

// Calculate sphere-projected position using the existing sphereDir from beginnormal_vertex
vec3 spherePos = uOffset + sphereDir * uRadius;

// Store data for fragment shader
vWorldPosition = vec4(spherePos, 1.0);
vSphereNormal = normalize(mat3(modelViewMatrix) * sphereDir);

// Calculate elevation offset from plate data
float elevation = 1.0;
if (getMapLayer(5u)) {
    // Initialize with default values if uniforms aren't set
    float hexJitterAmount = uHexJitterAmount > 0.0 ? uHexJitterAmount : 0.02;
    bool applyHexJitter = uApplyHexJitter;
    
    // Get elevation at this position
    // elevation = getElevationAtPosition(spherePos, applyHexJitter, hexJitterAmount);
    // elevation = 1.0;
    
    // Apply elevation to the sphere position
    // Scale the elevation to a reasonable range for the sphere
    float elevationScale = uRadius * 0.01; // Adjust this scale factor as needed
    spherePos += vSphereNormal * elevation * elevationScale;
    
    // Update the world position with the new elevated position
    vWorldPosition = vec4(spherePos, 1.0);
}

// Calculate model-view-projected position
vec4 spherePosView = viewMatrix * vec4(spherePos, 1.0);

// Sphere projection
if (getMapLayer(4u)) {
    mvPosition = spherePosView;
} else {
    // Use the same world position calculations but without sphere normalization
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    mvPosition = viewMatrix * worldPos;
    vWorldPosition = worldPos;
}

// Standard Three.js position calculation
gl_Position = projectionMatrix * mvPosition;