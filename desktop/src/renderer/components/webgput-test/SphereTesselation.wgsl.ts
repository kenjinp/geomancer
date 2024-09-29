export const sphereComputeShader = `
struct Params {
  levelOfDetail: f32,
  radius: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> vertices: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> normals: array<vec3f>;

fn sphericalToCartesian(theta: f32, phi: f32, r: f32) -> vec3f {
  let x = r * sin(theta) * cos(phi);
  let y = r * sin(theta) * sin(phi);
  let z = r * cos(theta);
  return vec3f(x, y, z);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  if (index >= u32(params.levelOfDetail * params.levelOfDetail * 6)) {
    return;
  }

  // Determine which face we're on (0-5)
  let face = index / (u32(params.levelOfDetail * params.levelOfDetail));
  let faceIndex = index % u32(params.levelOfDetail * params.levelOfDetail);
  
  // Convert linear index to 2D coordinates on the face
  let x = f32(faceIndex % u32(params.levelOfDetail)) / params.levelOfDetail;
  let y = f32(faceIndex / u32(params.levelOfDetail)) / params.levelOfDetail;

  // Convert face coordinates to spherical coordinates
  var theta: f32;
  var phi: f32;
  
  switch(face) {
    case 0u: { // Front
      theta = y * 3.14159;
      phi = x * 3.14159 * 0.5;
    }
    case 1u: { // Right
      theta = y * 3.14159;
      phi = (x + 1.0) * 3.14159 * 0.5;
    }
    case 2u: { // Back
      theta = y * 3.14159;
      phi = (x + 2.0) * 3.14159 * 0.5;
    }
    case 3u: { // Left
      theta = y * 3.14159;
      phi = (x + 3.0) * 3.14159 * 0.5;
    }
    case 4u: { // Top
      theta = 0.0;
      phi = x * 3.14159 * 2.0;
    }
    case 5u: { // Bottom
      theta = 3.14159;
      phi = x * 3.14159 * 2.0;
    }
    default: {}
  }

  let position = sphericalToCartesian(theta, phi, params.radius);
  vertices[index] = vec4f(position, 1.0);
  normals[index] = normalize(position);
}`;
