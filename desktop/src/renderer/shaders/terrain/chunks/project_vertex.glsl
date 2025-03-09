// Start with standard vertex projection
#ifdef USE_INSTANCING
vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );
#else
vec4 mvPosition = vec4( transformed, 1.0 );
#endif

// Calculate sphere-projected position
vec4 instWorldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
vec3 spherePos = uOffset + sphereDir * uRadius;

// Store data for fragment shader
vWorldPosition = vec4(spherePos, 1.0);
vSphereNormal = normalize(mat3(modelViewMatrix) * sphereDir);

// Calculate model-view-projected position
vec4 spherePosView = viewMatrix * vec4(spherePos, 1.0);
mvPosition = spherePosView;

// Standard Three.js position calculation
gl_Position = projectionMatrix * mvPosition; 