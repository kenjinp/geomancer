// Plate collision detection compute shader
// This shader detects boundaries between tectonic plates and determines collision types

struct Plate {
  driftAxis: vec3f,
  driftRate: f32,
  landElevation: f32,
  oceanElevation: f32,
  growthBias: f32,
  padding: f32
};

struct Parameters {
  convergentThreshold: f32,
  divergentThreshold: f32,
  transformThreshold: f32,
  seed: f32,
  width: f32,
  height: f32,
  resolution: f32,
  padding: f32
};

@group(0) @binding(0) var<uniform> params: Parameters;
@group(0) @binding(1) var<storage, read> plates: array<Plate>;
@group(0) @binding(2) var<storage, read> neighborIndices: array<u32>; // Now contains direct indices
@group(0) @binding(3) var<storage, read> positionMap: array<f32>;
@group(0) @binding(4) var<storage, read> hexDataInt: array<u32>;
@group(0) @binding(5) var<storage, read> hexDataFloat: array<f32>;
@group(0) @binding(6) var<storage, read_write> outputHexDataInt: array<u32>;
@group(0) @binding(7) var<storage, read_write> outputHexDataFloat: array<f32>;
@group(0) @binding(8) var<storage, read_write> collisionData: array<u32>;

const COLLISION_NONE: u32 = 0u;
const COLLISION_CONVERGENT: u32 = 1u;
const COLLISION_DIVERGENT: u32 = 2u;
const COLLISION_TRANSFORM: u32 = 3u;

// Function to get plate movement vector at a position
fn getPlateMovement(plateId: u32, position: vec3f) -> vec3f {
  // Handle invalid plate
  if (plateId == 0u || plateId > arrayLength(&plates)) {
    return vec3f(0.0);
  }
  
  let plate = plates[plateId - 1u]; // Adjust for 1-indexed plates
  
  // Calculate movement based on rotation axis and rate
  let normPosition = normalize(position);
  return cross(plate.driftAxis, normPosition) * plate.driftRate;
}

// Determine collision type between two plates
fn determineCollisionType(plateA: u32, plateB: u32, position: vec3f) -> u32 {
  // Get movement vectors
  let movementA = getPlateMovement(plateA, position);
  let movementB = getPlateMovement(plateB, position);
  
  // Calculate relative movement
  let relativeMovement = movementA - movementB;
  
  // Project onto normal (approximated by position)
  let normal = normalize(position);
  let normalComponent = dot(relativeMovement, normal);
  
  // Calculate tangential component
  let tangentialComponent = length(cross(relativeMovement, normal));
  
  // Determine collision type
  if (abs(normalComponent) < params.transformThreshold && tangentialComponent > params.transformThreshold) {
    return COLLISION_TRANSFORM;
  } else if (normalComponent > params.convergentThreshold) {
    return COLLISION_CONVERGENT;
  } else if (normalComponent < params.divergentThreshold) {
    return COLLISION_DIVERGENT;
  }
  
  return COLLISION_TRANSFORM; // Default
}

// Calculate collision intensity
fn calculateIntensity(plateA: u32, plateB: u32, position: vec3f) -> f32 {
  let movementA = getPlateMovement(plateA, position);
  let movementB = getPlateMovement(plateB, position);
  
  // Calculate relative velocity magnitude
  let relativeSpeed = length(movementA - movementB);
  
  // Normalize to 0-1 range (assuming max speed of PI/15)
  return min(relativeSpeed / (3.14159 / 15.0), 1.0);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
  let hexIndex = global_id.x;
  if (hexIndex >= u32(params.width * params.height)) {
    return;
  }
  
  // Copy the existing data first
  outputHexDataInt[hexIndex * 4u] = hexDataInt[hexIndex * 4u];
  outputHexDataInt[hexIndex * 4u + 1u] = hexDataInt[hexIndex * 4u + 1u];
  outputHexDataInt[hexIndex * 4u + 2u] = hexDataInt[hexIndex * 4u + 2u];
  outputHexDataInt[hexIndex * 4u + 3u] = hexDataInt[hexIndex * 4u + 3u];
  
  outputHexDataFloat[hexIndex * 4u] = hexDataFloat[hexIndex * 4u];
  outputHexDataFloat[hexIndex * 4u + 1u] = hexDataFloat[hexIndex * 4u + 1u];
  outputHexDataFloat[hexIndex * 4u + 2u] = hexDataFloat[hexIndex * 4u + 2u];
  outputHexDataFloat[hexIndex * 4u + 3u] = hexDataFloat[hexIndex * 4u + 3u];
  
  // Get the plate ID for this hex
  let plateId = hexDataInt[hexIndex * 4u];
  if (plateId == 0u) {
    return; // Skip invalid plates
  }
  
  // Get the position
  let posIndex = hexIndex * 3u;
  let position = vec3f(
    positionMap[posIndex],
    positionMap[posIndex + 1u],
    positionMap[posIndex + 2u]
  );
  
  // Check all neighbors using pre-decoded indices
  var neighborsFound = 0u;
  for (var n = 0u; n < 6u; n++) {
    // Get the pre-decoded neighbor index directly
    let neighborIndex = neighborIndices[hexIndex * 6u + n];
    
    // Skip invalid neighbors
    if (neighborIndex == 0xFFFFFFFFu) {
      continue;
    }
    
    // Ensure the index is in valid range
    if (neighborIndex >= u32(params.width * params.height)) {
      continue;
    }
    
    // Get neighbor's plate ID
    let neighborPlateId = hexDataInt[neighborIndex * 4u];
    
    // If different plate, we found a boundary
    if (neighborPlateId != 0u && neighborPlateId != plateId) {
      // Determine collision type using the original logic
      let collisionType = determineCollisionType(plateId, neighborPlateId, position);
      
      // Calculate intensity
      let intensity = calculateIntensity(plateId, neighborPlateId, position);
      
      // Store collision data in output
      let collisionIndex = (hexIndex * 8u) + neighborsFound;
      collisionData[collisionIndex] = (1u << 31u) | // Valid bit
                                    (collisionType << 16u) | // Collision type
                                    (neighborPlateId); // Neighbor plate ID
      
      // Also store intensity as a bit pattern in the next uint slot
      collisionData[collisionIndex + 1u] = bitcast<u32>(intensity);
      
      // Mark this hex as a boundary in the output
      outputHexDataInt[hexIndex * 4u + 3u] = (1u << 24u) | (collisionType << 16u) | neighborPlateId;
      
      // Store collision intensity
      outputHexDataFloat[hexIndex * 4u + 3u] = intensity;
      
      neighborsFound++;
      break; // One boundary per hex is enough
    }
  }
} 