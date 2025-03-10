// Math utility functions for terrain shader

float remap(in float value, in float x1, in float y1, in float x2, in float y2) {
    return ((value - x1) * (y2 - x2)) / (y1 - x1) + x2;
}

// Computes the great circle distance (in radians) between two points on a sphere.
// If the sphere has radius r, multiply the result by r for the surface distance.
float greatCircleDistance(vec3 a, vec3 b) {
    // Normalize input vectors in case they aren't unit length.
    vec3 na = normalize(a);
    vec3 nb = normalize(b);
    
    // Calculate cosine of the angle between them and clamp to the valid range.
    float cosTheta = clamp(dot(na, nb), -1.0, 1.0);
    
    // Return the angular distance (in radians)
    return acos(cosTheta);
}

// Constants
const float RAD2DEG = 180.0 / 3.1415926535897932384626433832795; 