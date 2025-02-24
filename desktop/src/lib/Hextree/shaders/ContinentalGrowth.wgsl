struct CellNeighbors {
    indices: array<u32, 6>
};

struct FrontierItem {
    cell_idx: u32,
    seed_idx: u32,
};

struct Frontier {
    size: atomic<u32>,
    items: array<FrontierItem>
};

struct Uniforms {
    totalLandCells: atomic<u32>,
    targetLandCells: u32,
    growthProbability: f32,
};

@group(0) @binding(0) var<storage> neighbors: array<CellNeighbors>;
@group(0) @binding(1) var<storage, read_write> crustTypes: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> currentFrontier: Frontier;
@group(0) @binding(3) var<storage, read_write> nextFrontier: Frontier;
@group(0) @binding(4) var<storage, read_write> uniforms: Uniforms;
@group(0) @binding(5) var<storage> plateIDs: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= atomicLoad(&currentFrontier.size)) { 
        return; 
    }

    let item = currentFrontier.items[idx];
    let currentCount = atomicLoad(&uniforms.totalLandCells);
    
    // Early exit if target reached
    if (currentCount >= uniforms.targetLandCells) {
        return;
    }

    for (var i = 0u; i < 6u; i++) {
        let candidate = neighbors[item.cell_idx].indices[i];
        if (candidate == 0xFFFFFFFFu) { 
            continue; 
        }

        // Get plate IDs for current cell and candidate
        let currentPlate = plateIDs[item.cell_idx];
        let candidatePlate = plateIDs[candidate];
        
        // Stop at plate boundaries
        if (currentPlate != candidatePlate) {
            continue;
        }

        // Only consider candidate if oceanic
        if (atomicLoad(&crustTypes[candidate]) != 0u || plateIDs[candidate] == 0u) {
            continue;
        }

        // Random growth chance with probability falloff
        // let rand = fract(sin(f32(id.x) * 12.9898 + f32(i) * 78.233)) * 43758.5453);
        // if (rand > uniforms.growthProbability) {
        //     continue;
        // }

        // Attempt to claim this cell
        if (atomicExchange(&crustTypes[candidate], 1u) == 0u) {
            atomicAdd(&uniforms.totalLandCells, 1u);
            let next_idx = atomicAdd(&nextFrontier.size, 1u);
            nextFrontier.items[next_idx] = FrontierItem(candidate, 0u);
        }
    }
}