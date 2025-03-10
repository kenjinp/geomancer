// Original normal calculation
vec3 objectNormal = vec3( normal );

// Sphere normal calculation
vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
vec3 sphereDir = normalize(worldPos.xyz - uOffset);
// Keep original normal for debugging, but use sphere normal for lighting
objectNormal = normalize(mat3(transpose(inverse(modelMatrix * instanceMatrix))) * sphereDir); 