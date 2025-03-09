// For sphere projection, override the normal to point outward from the sphere center
vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
vec3 sphereNormal = normalize(worldPos.xyz - uOffset);
objectNormal = normalize(mat3(transpose(inverse(modelMatrix * instanceMatrix))) * sphereNormal); 