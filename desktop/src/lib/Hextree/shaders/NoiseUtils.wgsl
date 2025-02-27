// Hash function for pseudo-randomness
fn hash(p: vec3<f32>) -> vec4<f32> {
    var p4 = fract(vec4<f32>(p.xyzx) * vec4<f32>(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

// Value noise function
fn valueNoise(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    
    // Smoothing
    let u = f * f * (3.0 - 2.0 * f);
    
    // 8 corners of the cube
    let a = hash(i).x;
    let b = hash(i + vec3<f32>(1.0, 0.0, 0.0)).x;
    let c = hash(i + vec3<f32>(0.0, 1.0, 0.0)).x;
    let d = hash(i + vec3<f32>(1.0, 1.0, 0.0)).x;
    let e = hash(i + vec3<f32>(0.0, 0.0, 1.0)).x;
    let f_val = hash(i + vec3<f32>(1.0, 0.0, 1.0)).x;
    let g = hash(i + vec3<f32>(0.0, 1.0, 1.0)).x;
    let h = hash(i + vec3<f32>(1.0, 1.0, 1.0)).x;
    
    // Trilinear interpolation
    let k0 = a;
    let k1 = b - a;
    let k2 = c - a;
    let k3 = e - a;
    let k4 = a + d - b - c;
    let k5 = a + f_val - b - e;
    let k6 = a + g - c - e;
    let k7 = a + b + c + e - d - f_val - g - h;
    
    return k0 + k1 * u.x + k2 * u.y + k3 * u.z + 
           k4 * u.x * u.y + k5 * u.x * u.z + k6 * u.y * u.z + 
           k7 * u.x * u.y * u.z;
}

// Improved Perlin noise with better gradients
fn perlinNoise(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    
    // Smoothing
    let u = f * f * (3.0 - 2.0 * f);
    
    // Generate gradients
    let grad00 = hash(i).xyz * 2.0 - 1.0;
    let grad10 = hash(i + vec3<f32>(1.0, 0.0, 0.0)).xyz * 2.0 - 1.0;
    let grad01 = hash(i + vec3<f32>(0.0, 1.0, 0.0)).xyz * 2.0 - 1.0;
    let grad11 = hash(i + vec3<f32>(1.0, 1.0, 0.0)).xyz * 2.0 - 1.0;
    let grad02 = hash(i + vec3<f32>(0.0, 0.0, 1.0)).xyz * 2.0 - 1.0;
    let grad12 = hash(i + vec3<f32>(1.0, 0.0, 1.0)).xyz * 2.0 - 1.0;
    let grad02_2 = hash(i + vec3<f32>(0.0, 1.0, 1.0)).xyz * 2.0 - 1.0;
    let grad12_2 = hash(i + vec3<f32>(1.0, 1.0, 1.0)).xyz * 2.0 - 1.0;
    
    // Dot products with corners
    let v000 = dot(grad00, f);
    let v100 = dot(grad10, f - vec3<f32>(1.0, 0.0, 0.0));
    let v010 = dot(grad01, f - vec3<f32>(0.0, 1.0, 0.0));
    let v110 = dot(grad11, f - vec3<f32>(1.0, 1.0, 0.0));
    let v001 = dot(grad02, f - vec3<f32>(0.0, 0.0, 1.0));
    let v101 = dot(grad12, f - vec3<f32>(1.0, 0.0, 1.0));
    let v011 = dot(grad02_2, f - vec3<f32>(0.0, 1.0, 1.0));
    let v111 = dot(grad12_2, f - vec3<f32>(1.0, 1.0, 1.0));
    
    // Interpolate
    let x00 = mix(v000, v100, u.x);
    let x10 = mix(v010, v110, u.x);
    let x01 = mix(v001, v101, u.x);
    let x11 = mix(v011, v111, u.x);
    
    let y0 = mix(x00, x10, u.y);
    let y1 = mix(x01, x11, u.y);
    
    return mix(y0, y1, u.z) * 0.5 + 0.5;
}

// FBM (Fractional Brownian Motion) function
fn fbm(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
    var sum = 0.0;
    var amp = 1.0;
    var freq = 1.0;
    var max_amp = 0.0;
    
    for (var i = 0; i < octaves; i++) {
        sum += amp * perlinNoise(p * freq);
        max_amp += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    
    return sum / max_amp;
}

// Warped FBM for more interesting patterns
fn warp_fbm(p: vec3<f32>, octaves: i32) -> f32 {    
    // Apply a rotation to break symmetry
    let rotated = vec3<f32>(
        p.x * 0.8 - p.y * 0.6 + p.z * 0.2,
        p.x * 0.3 + p.y * 0.8 + p.z * 0.3,
        p.x * -0.2 + p.y * 0.1 + p.z * 0.9
    );
    
    // First layer of fbm with offset vectors
    let warp_factor = vec3<f32>(
        fbm(rotated * 17.3 + vec3<f32>(0.1, 0.3, 1.2), octaves, 2.0, 0.5),
        fbm(rotated * 15.7 + vec3<f32>(5.9, 1.3, 2.1), octaves, 2.0, 0.5),
        fbm(rotated * 21.2 + vec3<f32>(3.7, 8.1, 1.1), octaves, 2.0, 0.5)
    );
    
    return fbm(rotated * 19.3 + 4.0 * warp_factor, octaves, 2.0, 0.5);
}

// Cost function that combines noise with distance
fn calculateCost(pos: vec3<f32>, seed: f32, scale: f32, octaves: i32) -> f32 {
    let offsetPos = pos + vec3<f32>(seed * 41.0, seed * 43.0, seed * 47.0);
    let noise = warp_fbm(offsetPos * scale, octaves);
    return noise;
} 