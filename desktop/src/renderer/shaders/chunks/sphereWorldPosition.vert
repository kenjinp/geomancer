// Use sphere-projected position for world position
// This code comes after begin_vertex, which defines 'transformed'

// Override the worldPosition calculation to use our sphere-projected position
vec4 worldPosition = vec4(uOffset + normalize(position) * uRadius, 1.0); 