export const terrainVertexShader = /* glsl */ `
uniform float uRadius;
uniform vec3 uOffset;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vInstanceColor;
varying vec3 vWorldPosition;
// attribute vec3 instanceColor;

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

// worldPosition is the position of the vertex in world space



void main() {
    // Generate color from instance ID
    int instanceId = gl_InstanceID;
    float instanceIdFloat = float(instanceId);
    float r = hash(instanceIdFloat);
    float g = hash(instanceIdFloat + 1.0);
    float b = hash(instanceIdFloat + 2.0);
    vec3 color = vec3(r, g, b);

    // Get original plane position (-0.5 to 0.5 on XY)
    vec3 pos = position;
    
    // Apply instance transformation
    vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
    
    // Convert cube position to sphere
    vec3 sphereDirection = normalize(worldPosition.xyz - uOffset);
    vec3 spherePosition = uOffset + sphereDirection * uRadius;
    
    // Transform to view space
    vec4 modelViewPosition = modelViewMatrix * vec4(spherePosition, 1.0);
    gl_Position = projectionMatrix * modelViewPosition;

    vWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
    
    // Pass varyings
    vNormal = normalize(normalMatrix * sphereDirection);
    vPosition = spherePosition;
    vInstanceColor = instanceColor;
}
`;

export const terrainFragmentShader = /* glsl */ `
// Fragment Shader
uniform samplerCube h3IndexMap;
varying vec3 vWorldPosition;

// Hexagon distance function
float hexDist(vec2 p) {
  p = abs(p);
  return max(p.x * 0.866025 + p.y * 0.5, p.y);
}

vec3 getH3Color(uint h3Index) {
  // Your existing random color implementation
    // Improved hash with better bit mixing
  uint h = h3Index;
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;

  // Convert to HSV with controlled variance
  float hue = float(h % 360u) / 360.0;
  float sat = 0.65 + float((h >> 8u) % 10u) * 0.035;
  float val = 0.5 + float((h >> 16u) % 8u) * 0.0625;
  
  // HSV to RGB conversion with gamma correction
  vec3 rgb = clamp(abs(mod(hue*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
  rgb = pow(mix(vec3(1.0), rgb, sat) * val, vec3(2.2));
  return rgb;
}

// Helper function to read H3 index at offset position
uint getH3IndexAt(vec3 pos) {
  vec4 sple = texture(h3IndexMap, normalize(pos), -2.0);
  uvec3 comp = uvec3(round(sple.rgb * 255.0));
  return (comp.r << 16u) | (comp.g << 8u) | comp.b;
}

void main() {
  // Sample H3 index with proper reconstruction
  vec3 dir = normalize(vWorldPosition);
  vec4 indexSample = texture(h3IndexMap, dir, -2.0);
  uvec3 components = uvec3(round(indexSample.rgb * 255.0));
  uint currentH3 = (components.r << 16u) | (components.g << 8u) | components.b;

  // Get base color
  vec3 color = getH3Color(currentH3);

  // Screen-space derivatives for edge detection
  vec3 dx = dFdx(dir);
  vec3 dy = dFdy(dir);
  
  // Sample neighbor indices
  uint rightH3 = getH3IndexAt(dir + dx * 0.5);
  uint leftH3 = getH3IndexAt(dir - dx * 0.5);
  uint topH3 = getH3IndexAt(dir + dy * 0.5);
  uint bottomH3 = getH3IndexAt(dir - dy * 0.5);

  // Calculate edge presence
  float edge = 0.0;
  edge += float(currentH3 != rightH3);
  edge += float(currentH3 != leftH3);
  edge += float(currentH3 != topH3);
  edge += float(currentH3 != bottomH3);
  edge = clamp(edge, 0.0, 1.0);

  // Procedural hexagon antialiasing
  vec3 localPos = dir * 25.07; // Scale to hex edge length (25km)
  vec2 hexUV = vec2(
    dot(localPos, vec3(1.0, 0.0, -0.5)),
    dot(localPos, vec3(0.0, 0.866, 0.5))
  );
  
  float dist = hexDist(fract(hexUV) - 0.5);
  float aa = fwidth(dist) * 1.5;
  float hexMask = 1.0 - smoothstep(-aa, aa, dist);

  // Combine effects
  color = mix(color, vec3(0.0), edge * 0.7);
  color *= mix(1.0, 0.9 + hexMask * 0.2, 1.0 - edge);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const terrainFragmentShader2 = /* glsl */ `
// Fragment Shader
vec3 randomColor(uint h3Index) {
  // Improved hash with better bit mixing
  uint h = h3Index;
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;

  // Convert to HSV with controlled variance
  float hue = float(h % 360u) / 360.0;
  float sat = 0.65 + float((h >> 8u) % 10u) * 0.035;
  float val = 0.5 + float((h >> 16u) % 8u) * 0.0625;
  
  // HSV to RGB conversion with gamma correction
  vec3 rgb = clamp(abs(mod(hue*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
  rgb = pow(mix(vec3(1.0), rgb, sat) * val, vec3(2.2));
  return rgb;
}

uniform samplerCube h3IndexMap;
varying vec3 vWorldPosition;

void main() {
  // Proper 24-bit reconstruction with nearest sampling
  vec4 indexSample = texture(h3IndexMap, normalize(vWorldPosition), -2.0);
  uvec3 components = uvec3(round(indexSample.rgb * 255.0));
  uint h3Index = (components.r << 16u) | (components.g << 8u) | components.b;
  
  // Generate color with neighbor contrast
  vec3 color = randomColor(h3Index);
  
  // Edge detection using gradient sampling
  vec3 dx = dFdx(vWorldPosition);
  vec3 dy = dFdy(vWorldPosition);
  vec3 neighbor1 = textureGrad(h3IndexMap, normalize(vWorldPosition + dx), dx, dy).rgb;
  vec3 neighbor2 = textureGrad(h3IndexMap, normalize(vWorldPosition + dy), dx, dy).rgb;
  float edge = max(length(neighbor1 - indexSample.rgb), length(neighbor2 - indexSample.rgb));
  
  gl_FragColor = vec4(mix(color, vec3(0.0), smoothstep(0.15, 0.4, edge * 3.0)), 1.0);
}
`;

export const terrainFragmentShaderx = /* glsl */ `
uniform samplerCube h3CubeMap;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vInstanceColor;

// Fragment Shader
vec3 randomColor(uint h3Index) {
  // Modified Jenkins hash for GPU
  uvec3 q = uvec3(h3Index, h3Index >> 11, h3Index >> 22);
  uint h = q.x ^ (q.y << 11) ^ (q.z << 22);
  h = h * 1597334677u; 

  // Convert to normalized float and HSV
  float hue = float(h % 360u) / 360.0;
  float sat = 0.7 + float(h % 13u) * 0.02;
  float val = 0.5 + float(h % 7u) * 0.07;
  
  // HSV to RGB conversion
  vec3 rgb = clamp(abs(mod(hue*6.0 + vec3(0.0,4.0,2.0), 6.0)-3.0)-1.0, 0.0, 1.0);
  return val * mix(vec3(1.0), rgb, sat);
}

float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void main() {
  const float EDGE_THRESHOLD = 0.01;
  vec3 normal = normalize(vWorldPosition);
  
  // Sample current and neighboring hex colors
  vec4 current = texture(h3CubeMap, normal);
  vec4 right = texture(h3CubeMap, normalize(normal + vec3(0.001,0,0)));
  vec4 left = texture(h3CubeMap, normalize(normal + vec3(-0.001,0,0)));
  vec4 top = texture(h3CubeMap, normalize(normal + vec3(0,0.001,0)));
  vec4 bottom = texture(h3CubeMap, normalize(normal + vec3(0,-0.001,0)));

  // Edge detection using color differences
  float edge = 
    length(current.rgb - right.rgb) +
    length(current.rgb - left.rgb) +
    length(current.rgb - top.rgb) +
    length(current.rgb - bottom.rgb);

  // Combine with original color
  vec3 finalColor = current.rgb * (1.0 - smoothstep(0.1, 0.4, edge));
  finalColor += vec3(1.0) * smoothstep(0.3, 0.6, edge);
  
  gl_FragColor = vec4(finalColor, 1.0);

  // Sample H3 index from cube map (encoded in RGB as 24-bit uint)
//   vec4 indexSample = texture(h3CubeMap, normalize(vWorldPosition));
//   uint h3Index = uint(indexSample.r * 255.0) << 16 |
//                  uint(indexSample.g * 255.0) << 8 |
//                  uint(indexSample.b * 255.0);
  
//   // Generate color with guaranteed neighbor contrast
//   vec3 color = randomColor(h3Index);
  
//   // Edge detection
//   float edge = length(color - randomColor(h3Index ^ 1u)); // Flip LSB
//   color = mix(color, vec3(0), smoothstep(0.3, 0.7, edge * 5.0));
  
//   gl_FragColor = vec4(color, 1.0);
}
`;
