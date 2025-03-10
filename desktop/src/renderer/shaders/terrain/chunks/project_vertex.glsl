#include <shadowmap_pars_vertex>

// Start with standard vertex projection
vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );

// Calculate sphere-projected position using the existing sphereDir from beginnormal_vertex
vec3 spherePos = uOffset + sphereDir * uRadius;

// Store data for fragment shader
vWorldPosition = vec4(spherePos, 1.0);
vSphereNormal = normalize(mat3(modelViewMatrix) * sphereDir);

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