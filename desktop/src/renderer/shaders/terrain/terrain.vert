uniform float uRadius;
uniform vec3 uOffset;
varying vec4 vWorldPosition;
varying float vInstanceId;
varying vec3 vColor;

void main() {
    // Get instance information
    vInstanceId = float(gl_InstanceID);
    
    // Just provide the original position to csm_Position
    // The patchMap will handle the sphere projection logic
    csm_Position = position;
}