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
    passIndex: u32,
};

@group(0) @binding(0) var<storage> neighbors: array<CellNeighbors>;
@group(0) @binding(1) var<storage, read_write> filled: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> currentFrontier: Frontier;
@group(0) @binding(3) var<storage, read_write> nextFrontier: Frontier;
// @group(0) @binding(4) var<storage> seeds: array<u32>;
@group(0) @binding(5) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= atomicLoad(&currentFrontier.size)) { 
        return; 
    }

    let item = currentFrontier.items[idx];
    let seed_idx = item.seed_idx;

    for (var i = 0u; i < 6u; i++) {
        let candidate = neighbors[item.cell_idx].indices[i];
        if (candidate == 0xFFFFFFFFu) { 
            continue; 
        }

        // Only consider candidate if unclaimed
        if (atomicLoad(&filled[candidate]) != 0u) { 
            continue; 
        }

        // For the first two passes, allow unconditional expansion
        var isContiguous: bool = (uniforms.passIndex <= 1u);
        if (uniforms.passIndex > 1u) {
            var contiguousFound: bool = false;
            // Check candidate's neighbors (skip the expanding cell) for same seed
            for (var j: u32 = 0u; j < 6u; j++) {
                let nbr = neighbors[candidate].indices[j];
                if (nbr == 0xFFFFFFFFu || nbr == item.cell_idx) { 
                    continue; 
                }
                if (atomicLoad(&filled[nbr]) == seed_idx + 1u) {
                    contiguousFound = true;
                    break;
                }
            }
            isContiguous = contiguousFound;
        }

        if (isContiguous) {
            if (atomicExchange(&filled[candidate], seed_idx + 1u) == 0u) {
                let next_idx = atomicAdd(&nextFrontier.size, 1u);
                nextFrontier.items[next_idx] = FrontierItem(candidate, seed_idx);
            }
        }
    }
}