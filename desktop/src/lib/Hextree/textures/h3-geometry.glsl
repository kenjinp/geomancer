uniform sampler2DArray h3LookupTex;
uniform vec3 faceNormals[20];
uniform mat3 faceTransforms[20];

int findIcosaFace(vec3 dir) {
  int face = -1;
  float maxDot = -1.0;
  for(int i = 0; i < 20; i++) {
    float dotProd = dot(dir, faceNormals[i]);
    if(dotProd > maxDot) {
      maxDot = dotProd;
      face = i;
    }
  }
  return face;
}

vec2 projectToFace(vec3 dir, int face) {
  vec3 local = faceTransforms[face] * dir;
  return vec2(atan(local.x, local.z), acos(local.y));
}

uint getH3Index(vec3 worldPos) {
  vec3 dir = normalize(worldPos);
  int face = findIcosaFace(dir);
  vec2 uv = projectToFace(dir, face);
  
  ivec3 texCoord = ivec3(
    int((uv.x + PI) / (2.0 * PI) * float(FACE_SIZE)),
    int(uv.y / PI * float(FACE_SIZE)),
    face
  );
  
  return uint(texelFetch(h3LookupTex, texCoord, 0).r * 4294967295.0);
}