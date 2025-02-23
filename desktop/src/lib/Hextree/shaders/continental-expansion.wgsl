@group(0) @binding(0) var<storage> neighbors: array<CellNeighbors>;
@group(0) @binding(1) var<storage> plates: array<u32>; // Tectonic plate indices
@group(0) @binding(2) var<storage, read_write> crust: array<atomic<u32>>; // 0 = oceanic, 1 = continental

fn main() {
  // Existing flood fill logic, but with additional checks:
  if (plates[candidate] != currentPlate) {
    return; // Don't expand across plate boundaries
  }
  
  if (atomicExchange(&crust[candidate], 1) == 0) {
    // Track expansion
  }
} 