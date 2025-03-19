// Hydraulic erosion compute shader
// This shader simulates water flow, sediment transport, and erosion/deposition

@group(0) @binding(0) var<storage> elevations: array<f32>;      // Current terrain elevations
@group(0) @binding(1) var<storage, read_write> water: array<f32>;        // Water volume at each cell
@group(0) @binding(2) var<storage, read_write> sediment: array<f32>;     // Suspended sediment at each cell
@group(0) @binding(3) var<storage> neighbors: array<u32>;       // Neighbor indices for each hex cell
@group(0) @binding(4) var<storage, read_write> newElevations: array<f32>; // Output elevation values

struct Uniforms {
    iterations: f32,         // Number of iterations (used in main logic)
    rainAmount: f32,         // Amount of rainfall per iteration
    evaporationRate: f32,    // Rate at which water evaporates
    sedimentCapacity: f32,   // Max sediment water can carry (based on velocity)
    solubility: f32,         // Rate of sediment dissolution
    depositionRate: f32,     // Rate at which sediment is deposited
    seed: f32,               // Random seed for rainfall variation
    padding: f32,            // Padding for alignment
};

@group(0) @binding(5) var<uniform> params: Uniforms;

// Helper function to get the water and elevation total (water surface level)
fn getWaterSurfaceLevel(elevation: f32, waterAmount: f32) -> f32 {
    return elevation + waterAmount;
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
    
    // Get current values
    let currentElevation = elevations[idx];
    var currentWater = water[idx];
    var currentSediment = sediment[idx];
    var newElevation = currentElevation;
    
    // Step 1: Add rainfall (with small random variation)
    let rainfall = params.rainAmount * (0.8 + 0.4 * rand(params.seed, idx));
    currentWater += rainfall;
    
    // Step 2: Calculate water flow
    let neighborBaseIdx = idx * 6; // 6 neighbors per hex in a hexagonal grid
    var outflow = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0); // Initialize array with zeros
    var totalOutflow = 0.0;
    var validNeighbors = 0;
    
    // Update to fix any other array variables with the same issue in subsequent code
    var neighborElevations: array<f32, 6> = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    var slopes: array<f32, 6> = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    
    // Current water surface level
    let currentWaterLevel = getWaterSurfaceLevel(currentElevation, currentWater);
    
    // Calculate outflow to each neighbor
    for (var i = 0u; i < 6u; i++) {
        let neighborIdx = neighbors[neighborBaseIdx + i];
        
        // Skip invalid neighbors
        if (neighborIdx == 0xFFFFFFFF || neighborIdx >= arrayLength(&elevations)) {
            outflow[i] = 0.0;
            neighborElevations[i] = currentElevation; // Set to current for invalid neighbors
            slopes[i] = 0.0;
            continue;
        }
        
        validNeighbors += 1;
        let neighborElevation = elevations[neighborIdx];
        let neighborWater = water[neighborIdx];
        
        // Store neighbor elevation for later use
        neighborElevations[i] = neighborElevation;
        
        let neighborWaterLevel = getWaterSurfaceLevel(neighborElevation, neighborWater);
        
        // Only flow if current water level is higher than neighbor's
        if (currentWaterLevel > neighborWaterLevel) {
            let heightDiff = currentWaterLevel - neighborWaterLevel;
            // Flow rate based on height difference
            outflow[i] = min(heightDiff * 0.4, currentWater); // Limit outflow to available water
            totalOutflow += outflow[i];
            slopes[i] = heightDiff; // Store slope info
        } else {
            outflow[i] = 0.0;
            slopes[i] = 0.0;
        }
    }
    
    // Adjust outflow if total exceeds available water
    if (totalOutflow > currentWater && totalOutflow > 0.0) {
        let scale = currentWater / totalOutflow;
        for (var i = 0u; i < 6u; i++) {
            outflow[i] *= scale;
        }
        totalOutflow = currentWater;
    }
    
    // Step 3: Erode and transport sediment
    // Calculate velocity from total outflow
    let velocity = totalOutflow;
    
    // Higher velocity = more erosion
    let erosionCapacity = params.sedimentCapacity * velocity;
    
    // Erode if we have water and carrying capacity
    if (currentWater > 0.01 && erosionCapacity > currentSediment) {
        // Calculate how much to erode
        let erosionAmount = min(
            params.solubility * (erosionCapacity - currentSediment),
            0.05  // Limit to prevent excessive erosion
        );
        
        // Erode the terrain and add to sediment
        newElevation -= erosionAmount;
        currentSediment += erosionAmount;
    }
    // Deposit sediment if carrying too much or low velocity
    else if (currentSediment > 0.0 && (erosionCapacity < currentSediment || currentWater < 0.01)) {
        // Calculate how much to deposit
        let depositionAmount = params.depositionRate * 
                              (currentSediment - erosionCapacity);
        
        // Deposit sediment back to terrain
        newElevation += depositionAmount;
        currentSediment -= depositionAmount;
    }
    
    // Step 4: Update water level - remove outflow water
    currentWater -= totalOutflow;
    
    // Step 5: Evaporation
    let evaporation = currentWater * params.evaporationRate;
    currentWater -= evaporation;
    
    // Make sure we don't get negative water
    currentWater = max(0.0, currentWater);
    
    // Note: Instead of directly writing to neighbor cells (which requires atomic operations),
    // we'll handle this in a separate pass in the CPU-side implementation.
    // This is a simplification for the shader version.
    
    // Update final values for this cell
    water[idx] = currentWater;
    sediment[idx] = currentSediment;
    newElevations[idx] = newElevation;
} 