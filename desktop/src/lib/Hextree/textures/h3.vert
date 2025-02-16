
uniform float uRadius;
uniform vec3 uOffset;
varying vec3 vWorldPosition;
void main() {

      // Generate color from instance ID
    int instanceId = gl_InstanceID;
    // float instanceIdFloat = float(instanceId);
    // float r = hash(instanceIdFloat);
    // float g = hash(instanceIdFloat + 1.0);
    // float b = hash(instanceIdFloat + 2.0);
    // vec3 color = vec3(r, g, b);

    // Get original plane position (-0.5 to 0.5 on XY)
    vec3 pos = position;
    
    // Apply instance transformation
    vec4 worldPosition = instanceMatrix * vec4(pos, 1.0);
    
    // Convert cube position to sphere
    vec3 sphereDirection = normalize(worldPosition.xyz - uOffset);
    vec3 spherePosition = uOffset + sphereDirection * uRadius;
    
    // Transform to view space
    vec4 modelViewPosition = modelViewMatrix * vec4(spherePosition, 1.0);
    
    vWorldPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
    
    gl_Position = projectionMatrix * modelViewPosition;
} 