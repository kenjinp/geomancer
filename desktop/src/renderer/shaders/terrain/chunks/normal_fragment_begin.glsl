// Use sphere normal for lighting
vec3 normal = normalize(vSphereNormal);

#ifdef FLAT_SHADED
  vec3 fdx = dFdx(vViewPosition);
  vec3 fdy = dFdy(vViewPosition);
  normal = normalize(cross(fdx, fdy));
#endif

#ifdef DOUBLE_SIDED
  normal = normal * (float(gl_FrontFacing) * 2.0 - 1.0);
#endif

// For compatibility with the rest of the shader
vec3 nonPerturbedNormal = normal; 