struct CellNeighbors {
    indices: array<u32, 6>
};

struct FrontierItem {
    cell_idx: u32,
};

struct Frontier {
    size: atomic<u32>,
    items: array<FrontierItem>
};

struct Uniforms {
    plate_id: u32,
    pass_index: u32,
};

@group(0) @binding(0) var<storage> neighbors: array<CellNeighbors>;
@group(0) @binding(1) var<storage> plates: array<u32>;       // Tectonic plate indices
@group(0) @binding(2) var<storage, read_write> crust: array<atomic<u32>>; // 0 = oceanic, 1 = continental
@group(0) @binding(3) var<storage, read_write> currentFrontier: Frontier;
@group(0) @binding(4) var<storage, read_write> nextFrontier: Frontier;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= atomicLoad(&currentFrontier.size)) { 
        return; 
    }

    let item = currentFrontier.items[idx];
    let cell_idx = item.cell_idx;

    // Verify we're still within the target plate (safety check)
    if (plates[cell_idx] != uniforms.plate_id) {
        return;
    }

    for (var i = 0u; i < 6u; i++) {
        let candidate = neighbors[cell_idx].indices[i];
        if (candidate == 0xFFFFFFFFu) { 
            continue; 
        }

        // Critical plate boundary check
        if (plates[candidate] != uniforms.plate_id) {
            continue;
        }

        // Only convert oceanic crust (0) to continental (1)
        if (atomicLoad(&crust[candidate]) != 0u) {
            continue;
        }

        // Contiguity check for later passes (after first 4)
        var allow_expansion: bool = uniforms.pass_index <= 3u;
        if (!allow_expansion) {
            allow_expansion = false;
            // Check adjacent cells for continental crust
            for (var j = 0u; j < 6u; j++) {
                let neighbor = neighbors[candidate].indices[j];
                if (neighbor != 0xFFFFFFFFu && atomicLoad(&crust[neighbor]) == 1u) {
                    allow_expansion = true;
                    break;
                }
            }
        }

        if (allow_expansion) {
            // Attempt to claim this cell for continental crust
            if (atomicExchange(&crust[candidate], 1u) == 0u) {
                let next_idx = atomicAdd(&nextFrontier.size, 1u);
                nextFrontier.items[next_idx] = FrontierItem(candidate);
            }
        }
    }
} 