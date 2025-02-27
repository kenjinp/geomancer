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
@group(0) @binding(6) var<storage> positions: array<vec3<f32>>;

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

        // Get 3D position of candidate cell
        let candidatePos = positions[candidate];
        
        // Calculate fractal noise
        let noise = fractalPerlin(candidatePos * 2.0, 5u, 0.707);
        let elevationCost = noise; // smoothstep(-0.2, 0.8, noise);
        
        // Combine growth probability with noise cost
        let growthChance = (1.0 - elevationCost);
        
        // Generate random value using cell index and iteration
        let rand = fract(sin(f32(candidate) * 12.9898 + f32(i) * 78.233) * 43758.5453);
        
        if (rand > growthChance) {
            continue;
        }

        // Attempt to claim this cell
        if (atomicExchange(&crustTypes[candidate], 1u) == 0u) {
            atomicAdd(&uniforms.totalLandCells, 1u);
            let next_idx = atomicAdd(&nextFrontier.size, 1u);
            nextFrontier.items[next_idx] = FrontierItem(candidate, 0u);
        }
    }
}

fn hash3(n: vec3<f32>) -> vec3<f32> {
    let p = vec3<f32>(n.xy, n.z + 1.0);
    let p2 = vec3<f32>(
        dot(p, vec3<f32>(127.1, 311.7, 74.7)),
        dot(p, vec3<f32>(269.5, 183.3, 246.1)),
        dot(p, vec3<f32>(113.5, 271.9, 124.6))
    );
    return -1.0 + 2.0 * fract(sin(p2) * 43758.5453123);
}

fn perlin(pos: vec3<f32>) -> f32 {
    let pi = floor(pos);
    let pf = pos - pi;
    let pf2 = pf * pf * (3.0 - 2.0 * pf);
    
    return mix(
        mix(
            mix(
                dot(pf - vec3<f32>(0,0,0), hash3(pi + vec3<f32>(0,0,0))),
                dot(pf - vec3<f32>(1,0,0), hash3(pi + vec3<f32>(1,0,0))), pf2.x),
            mix(
                dot(pf - vec3<f32>(0,1,0), hash3(pi + vec3<f32>(0,1,0))),
                dot(pf - vec3<f32>(1,1,0), hash3(pi + vec3<f32>(1,1,0))), pf2.x), 
            pf2.y),
        mix(
            mix(
                dot(pf - vec3<f32>(0,0,1), hash3(pi + vec3<f32>(0,0,1))),
                dot(pf - vec3<f32>(1,0,1), hash3(pi + vec3<f32>(1,0,1))), pf2.x),
            mix(
                dot(pf - vec3<f32>(0,1,1), hash3(pi + vec3<f32>(0,1,1))),
                dot(pf - vec3<f32>(1,1,1), hash3(pi + vec3<f32>(1,1,1))), pf2.x), 
            pf2.y),
        pf2.z);
}

fn fractalPerlin(pos: vec3<f32>, octaves: u32, persistence: f32) -> f32 {
    var total: f32 = 0.0;
    var frequency: f32 = 1.0;
    var amplitude: f32 = 1.0;
    var maxValue: f32 = 0.0;
    
    for(var i: u32 = 0u; i < octaves; i++) {
        total += perlin(pos * frequency) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2.0;
    }
    
    return total / maxValue;
}