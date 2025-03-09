// Grid utility functions

vec3 grid(vec2 p) {
    return vec3(1.0) * smoothstep(0.99, 1.0, max(sin((p.x)*20.0), sin((p.y)*20.0)));
}

float getGrid(vec2 localPosition, float size, float thickness) {
    vec2 r = localPosition.xy / size;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = min(grid.x, grid.y) + 1.0 - thickness;
    return 1.0 - min(line, 1.0);
}

float getGridFromFloat(float localPosition, float size, float thickness) {
    float r = localPosition / size;
    float grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = grid + 1.0 - thickness;
    return 1.0 - min(line, 1.0);
} 