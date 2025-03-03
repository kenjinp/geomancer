// Lighting functions

float calculateDiffuseLighting(vec3 normal, vec3 lightDir) {
    return max(dot(normal, lightDir), 0.0);
}

vec3 calculateSurfaceNormal(vec3 position, uint cellId) {
    // Get the center of the current cell
    vec3 cellCenter = normalize(getH3Position(float(cellId)));
    
    // For a sphere, the normal at any point is just the normalized position
    return normalize(position);
}

vec3 applyLighting(vec3 baseColor, vec3 normal, vec3 lightDir) {
    // Ambient light component
    float ambientStrength = 0.00001;
    vec3 ambient = ambientStrength * baseColor;
    
    // Diffuse light component
    float diff = calculateDiffuseLighting(normal, lightDir);
    vec3 diffuse = diff * baseColor;
    
    // Combine lighting
    return ambient + diffuse;
} 