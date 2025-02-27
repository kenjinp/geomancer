@group(0) @binding(0) var<storage> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> elevations: array<f32>;

// Hash function for pseudo-randomness
fn hash(p: vec3<f32>) -> vec4<f32> {
    var p4 = fract(vec4<f32>(p.xyzx) * vec4<f32>(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

// Remap a value from one range to another
fn remap(value: f32, fromMin: f32, fromMax: f32, toMin: f32, toMax: f32) -> f32 {
    let fromRange = fromMax - fromMin;
    let toRange = toMax - toMin;
    return toMin + (((value - fromMin) * toRange) / fromRange);
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
    
    // Scale result to [-1, 1] range
    return mix(y0, y1, u.z) * 0.5 + 0.5;
}

// FBM (Fractional Brownian Motion) function
// Works well with both positive and negative inputs, including unit sphere coordinates
fn fbm(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
    var sum = 0.0;
    var amp = 1.0;
    var freq = 1.0;
    var max_amp = 0.0;
    
    for (var i = 0; i < octaves; i++) {
        // Use Perlin noise as the base function for better quality
        // Scale input to avoid potential grid alignment artifacts with unit sphere
        sum += amp * perlinNoise(p * freq);
        max_amp += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    
    // Normalize
    return sum / max_amp;
}

// Specialized FBM for unit sphere coordinates with better distribution
fn fbm_sphere(p: vec3<f32>, octaves: i32, lacunarity: f32, gain: f32) -> f32 {
    // Use a higher scale factor for more variation
    // The 19.7 value is prime and helps avoid grid patterns
    return fbm(p, octaves, lacunarity, gain);
}

// Improved warp FBM for spherical coordinates
fn warp_fbm_sphere(p: vec3<f32>, octaves: i32) -> f32 {
    // Ensure we're working with a unit vector
    let p_norm = p;
    
    // Apply a rotation to break symmetry
    let rotated = vec3<f32>(
        p_norm.x * 0.8 - p_norm.y * 0.6 + p_norm.z * 0.2,
        p_norm.x * 0.3 + p_norm.y * 0.8 + p_norm.z * 0.3,
        p_norm.x * -0.2 + p_norm.y * 0.1 + p_norm.z * 0.9
    );
    
    // First layer of fbm with offset vectors that are not aligned with axes
    let q = vec3<f32>(
        fbm(rotated * 17.3 + vec3<f32>(0.1, 0.3, 1.2), octaves, 2.0, 0.5),
        fbm(rotated * 15.7 + vec3<f32>(5.9, 1.3, 2.1), octaves, 2.0, 0.5),
        fbm(rotated * 21.2 + vec3<f32>(3.7, 8.1, 1.1), octaves, 2.0, 0.5)
    );
    
    // Second layer with more warping
    return fbm(rotated * 19.3 + 4.0 * q, octaves, 2.0, 0.5);
}

struct Uniforms {
    seed: f32,        // Start with float values for better alignment
    scale: f32,
    warpStrength: f32,
    baseStrength: f32,
    persistence: f32,
    octaves: f32,     // Put integer at the end
};

@group(0) @binding(2) var<uniform> params: Uniforms;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    
    if (idx >= arrayLength(&elevations)) {
        return;
    }

    // Get position components from the buffer
    let x = positions[idx * 3];
    let y = positions[idx * 3 + 1];
    let z = positions[idx * 3 + 2];

    let pos = vec3<f32>(x, y, z);

    // Add seed offset to position
    let offsetPos = pos + vec3<f32>(params.seed * 41, params.seed * 43, params.seed * 47);

    // Use the improved spherical noise function with seeded position
    var noise = params.warpStrength * warp_fbm_sphere(offsetPos * params.scale, i32(params.octaves)) + 
                params.baseStrength * fbm_sphere(offsetPos * params.scale, i32(params.octaves), 2.0, params.persistence);
    
    noise = clamp(noise, 0.0, 1.0);
    
    // Remap noise from [0,1] to [-1,1]
    elevations[idx] = remap(noise, 0.0, 1.0, -1.0, 1.0);
} 