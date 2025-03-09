// Complete replacement for project_vertex
// This handles positioning of the vertices for sphere projection

// First, handle all the standard project_vertex behavior 
vec3 transformed = vec3(position);
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;

// Then override with our sphere projection
vInstanceId = float(gl_InstanceID);
vOriginalPosition = position;

// Calculate sphere-projected position
vec4 instWorldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
vec3 sphereDir = normalize(instWorldPos.xyz - uOffset);
vec3 spherePos = uOffset + sphereDir * uRadius;

// Pass data to fragment shader
vWorldPosition = vec4(spherePos, 1.0);
vSphereNormal = normalize(mat3(modelViewMatrix) * sphereDir);

// Calculate adjusted object space position
vec4 spherePosView = viewMatrix * vec4(spherePos, 1.0);
mat4 invModelViewMat = inverse(modelViewMatrix);
mat4 invInstanceMat = inverse(instanceMatrix);
vec4 objectSpacePos = invInstanceMat * invModelViewMat * spherePosView;

// Override the transformed position
transformed = objectSpacePos.xyz;
mvPosition = modelViewMatrix * vec4(transformed, 1.0);
gl_Position = projectionMatrix * mvPosition; 