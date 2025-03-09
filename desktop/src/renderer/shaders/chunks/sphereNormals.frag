// Use the sphere normal directly for lighting calculations
vec3 normal = normalize(vSphereNormal);

#ifdef FLAT_SHADED
  // Still allow flat shading option when enabled
  vec3 fdx = dFdx(vViewPosition);
  vec3 fdy = dFdy(vViewPosition);
  normal = normalize(cross(fdx, fdy));
#endif

#ifdef DOUBLE_SIDED
  normal = normal * (float(gl_FrontFacing) * 2.0 - 1.0);
#endif

// No need for normalMatrix in the fragment shader
// normalMatrix is only available in the vertex shader

// Declare nonPerturbedNormal for compatibility with the rest of the shader
vec3 nonPerturbedNormal = normal; 