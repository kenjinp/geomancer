// Thermal erosion compute shader
// This shader simulates the process of thermal erosion where material from steep slopes moves downhill

@group(0) @binding(0) var<storage> elevations: array<f32>; // Current elevation values
@group(0) @binding(1) var<storage> neighbors: array<u32>;  // Neighbor indices for each hex cell
@group(0) @binding(2) var<storage, read_write> newElevations: array<f32>; // Output elevation values

struct Uniforms {
    iterations: f32,     // Number of iterations (used in main logic)
    talus: f32,          // Critical angle tangent threshold
    erosionRate: f32,    // How much material moves in one step
    smoothingFactor: f32, // Amount of smoothing to apply
    seed: f32,           // Random seed for slight variations
};

@group(0) @binding(3) var<uniform> params: Uniforms;

// Helper function to calculate slope between two elevations
fn calculateSlope(elev1: f32, elev2: f32) -> f32 {
    return abs(elev1 - elev2);
}

// Random function based on seed
fn rand(seed: f32, x: u32) -> f32 {
    let a = 1664525.0;
    let c = 1013904223.0;
    let m = 4294967296.0; // 2^32
    return fract(sin(seed * f32(x) * a + c) * m);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    
    if (idx >= arrayLength(&elevations)) {
        return;
    }
    
    // Get current elevation
    let currentElevation = elevations[idx];
    
    // Initialize material to distribute and new elevation
    var materialToDistribute = 0.0;
    var newElevation = currentElevation;
    
    // Random slight variation to prevent grid artifacts
    let randVariation = (rand(params.seed, idx) - 0.5) * 0.01;
    
    // Get base index for neighbors of this hex
    let neighborBaseIdx = idx * 6; // 6 neighbors per hex in a hexagonal grid
    
    // Find the steepest slopes and their total
    var totalSteepness = 0.0;
    var steeperNeighbors = 0;
    var neighborElevations: array<f32, 6>;
    var slopes: array<f32, 6>;
    
    // Process all six neighbors
    for (var i = 0u; i < 6u; i++) {
        let neighborIdx = neighbors[neighborBaseIdx + i];
        
        // Skip invalid neighbors (edge of map or other invalid indices)
        if (neighborIdx == 0xFFFFFFFF || neighborIdx >= arrayLength(&elevations)) {
            neighborElevations[i] = currentElevation; // Use current elevation for invalid neighbors
            slopes[i] = 0.0;
            continue;
        }
        
        neighborElevations[i] = elevations[neighborIdx];
        let slope = calculateSlope(currentElevation, neighborElevations[i]);
        slopes[i] = slope;
        
        // Check if neighbor is lower and slope is above talus angle
        if (neighborElevations[i] < currentElevation && slope > params.talus) {
            totalSteepness += slope;
            steeperNeighbors += 1;
        }
    }
    
    // Calculate material to distribute based on excessive slopes
    if (steeperNeighbors > 0 && totalSteepness > 0.0) {
        // Calculate how much material to move
        materialToDistribute = min(
            (totalSteepness - (f32(steeperNeighbors) * params.talus)) * params.erosionRate,
            0.5 // Limit to prevent oscillations
        );
        
        // Remove the material from current cell
        newElevation = currentElevation - materialToDistribute;

        // Distribute material to neighbors
        for (var i = 0u; i < 6u; i++) {
            let neighborIdx = neighbors[neighborBaseIdx + i];
            
            // Skip invalid neighbors
            if (neighborIdx == 0xFFFFFFFF || neighborIdx >= arrayLength(&elevations)) {
                continue;
            }
            
            // Only distribute to neighbors that contributed to the erosion
            if (neighborElevations[i] < currentElevation && slopes[i] > params.talus) {
                let share = (slopes[i] / totalSteepness) * materialToDistribute;
                newElevations[neighborIdx] = newElevations[neighborIdx] + share;
            }
        }
    }
    
    // Apply smoothing if needed
    if (params.smoothingFactor > 0.0) {
        var avgElevation = 0.0;
        var validNeighbors = 0;
        
        for (var i = 0u; i < 6u; i++) {
            let neighborIdx = neighbors[neighborBaseIdx + i];
            if (neighborIdx != 0xFFFFFFFF && neighborIdx < arrayLength(&elevations)) {
                avgElevation += neighborElevations[i];
                validNeighbors += 1;
            }
        }
        
        if (validNeighbors > 0) {
            avgElevation /= f32(validNeighbors);
            newElevation = mix(newElevation, avgElevation, params.smoothingFactor);
        }
    }
    
    // Apply the random variation to break up grid patterns
    newElevation += randVariation;
    
    // Write the new elevation
    newElevations[idx] = newElevation;
    
    // Note: Material distribution to lower neighbors is handled implicitly
    // in the next iteration when those neighbors process their elevations
} 