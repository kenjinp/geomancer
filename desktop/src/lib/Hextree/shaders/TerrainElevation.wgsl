#include "NoiseUtils.wgsl"

@group(0) @binding(0) var<storage> positions: array<f32>;
@group(0) @binding(1) var<storage, read_write> elevations: array<f32>;

struct Uniforms {
    seed: f32,        // Start with float values for better alignment
    scale: f32,
    warpStrength: f32,
    baseStrength: f32,
    persistence: f32,
    octaves: f32,     // Put integer at the end
    plateNoiseStrength: f32, // New parameter for plate noise strength
};

@group(0) @binding(2) var<uniform> params: Uniforms;
@group(0) @binding(3) var<storage> plateIds: array<u32>;

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

    // Get plate ID and convert to float for noise offset
    let plateId = f32(plateIds[idx]);
    
    // Add seed offset to position
    let offsetPos = pos + vec3<f32>(params.seed * 41, params.seed * 43, params.seed * 47);
    
    // Add plate-specific offset based on plate ID
    let plateOffset = vec3<f32>(
        plateId * 17.0 * params.plateNoiseStrength,
        plateId * 19.0 * params.plateNoiseStrength,
        plateId * 23.0 * params.plateNoiseStrength
    );
    
    // Combine position with plate offset
    let finalPos = offsetPos + plateOffset;

    // Use the improved spherical noise function with seeded position
    var noise = params.warpStrength * warp_fbm(finalPos * params.scale, i32(params.octaves)) + 
                params.baseStrength * fbm(finalPos * params.scale, i32(params.octaves), 2.0, params.persistence);
    
    noise = clamp(noise, 0.0, 1.0);
    
    // Remap noise from [0,1] to [-1,1]
    elevations[idx] = remap(noise, 0.0, 1.0, -1.0, 1.0);
} 