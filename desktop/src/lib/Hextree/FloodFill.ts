import * as h3 from "h3-js";
import { GPUDevice } from "./WebGPU";

const RESOLUTION_CELL_FACTORS: Record<number, number> = {
  0: 122, // Base icosahedron cells
  1: 842,
  2: 5882,
  3: 41162,
  4: 288122,
  5: 2016842,
  6: 14117882,
  7: 98825162,
  8: 691776122,
  9: 4842432842,
  10: 33897029882,
};

export type FloodFillConfig = {
  maxCells: number;
  maxFrontierSize: number;
  maxSeeds?: number;
};

export type FloodFillResult = {
  seedIndex: number;
  cells: string[];
}[];

export class HexGridFloodFill {
  private device: globalThis.GPUDevice;
  private pipeline: GPUComputePipeline;
  private neighborBuffer: GPUBuffer;
  private filledBuffer: GPUBuffer;
  private frontierBuffers: [GPUBuffer, GPUBuffer];
  private h3Indices: Map<string, number>;
  private bindGroups: GPUBindGroup[] = [];
  private seedBuffer: GPUBuffer;

  private constructor(private config: FloodFillConfig) {}

  public static async create(
    config: FloodFillConfig
  ): Promise<HexGridFloodFill> {
    const instance = new HexGridFloodFill(config);
    await instance.initialize();
    return instance;
  }

  private async initialize() {
    this.device = await GPUDevice.create();
    await this.createBuffers();
    await this.createPipeline();
  }

  private async createBuffers() {
    // Neighbor buffer (R32Uint per neighbor)
    this.neighborBuffer = this.device.createBuffer({
      size: this.config.maxCells * 6 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Create filledBuffer without MAP_READ.
    this.filledBuffer = this.device.createBuffer({
      size: this.config.maxCells * 4,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });

    // Initialize it to zero by copying from a temporary zero buffer.
    const zeros = new Uint32Array(this.config.maxCells);
    const tempBuffer = this.device.createBuffer({
      size: zeros.byteLength,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Uint32Array(tempBuffer.getMappedRange()).set(zeros);
    tempBuffer.unmap();

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      tempBuffer,
      0,
      this.filledBuffer,
      0,
      zeros.byteLength
    );
    this.device.queue.submit([encoder.finish()]);
    // tempBuffer is only used for initialization.

    // Double-buffered frontier queues
    this.frontierBuffers = [
      this.createFrontierBuffer(),
      this.createFrontierBuffer(),
    ];

    // Add seed buffer
    this.seedBuffer = this.device.createBuffer({
      size: this.config.maxSeeds * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  private createFrontierBuffer(): GPUBuffer {
    return this.device.createBuffer({
      size: 4 + this.config.maxFrontierSize * 8,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
  }

  private async createPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: this.getShaderCode(),
    });

    this.pipeline = this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    this.createBindGroups();
  }

  private createBindGroups() {
    this.bindGroups = [this.createBindGroup(0), this.createBindGroup(1)];
  }

  private createBindGroup(frontierIndex: number): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.neighborBuffer } },
        { binding: 1, resource: { buffer: this.filledBuffer } },
        {
          binding: 2,
          resource: { buffer: this.frontierBuffers[frontierIndex] },
        },
        {
          binding: 3,
          resource: { buffer: this.frontierBuffers[1 - frontierIndex] },
        },
        // { binding: 4, resource: { buffer: this.seedBuffer } },
      ],
    });
  }

  public async fill(seedCells: string[]): Promise<FloodFillResult> {
    const seedIndices = seedCells.map((cell) => this.h3Indices.get(cell));
    if (seedIndices.some((idx) => idx === undefined)) {
      throw new Error("One or more invalid seed cells");
    }

    await this.initializeFill(seedIndices as number[]);
    return this.runComputePasses();
  }

  private async initializeFill(seedIndices: number[]) {
    // Validate we don't exceed frontier capacity
    if (seedIndices.length > this.config.maxFrontierSize) {
      throw new Error(
        `Too many seeds (${seedIndices.length}) for frontier capacity ${this.config.maxFrontierSize}`
      );
    }

    // Reset entire filled buffer to zero at start of each fill
    const zeroData = new Uint32Array(this.config.maxCells);
    this.device.queue.writeBuffer(this.filledBuffer, 0, zeroData.buffer);

    // Mark seeds with (i+1) values after reset
    seedIndices.forEach((idx, i) => {
      const data = new Uint32Array([i + 1]);
      this.device.queue.writeBuffer(this.filledBuffer, idx * 4, data);
    });

    // (Optional) Write seed indices to seed buffer if needed.
    const seedData = new Uint32Array(seedIndices);
    this.device.queue.writeBuffer(this.seedBuffer, 0, seedData);

    // Initialize frontier with all seeds.
    const frontierData = new Uint32Array(1 + seedIndices.length * 2);
    frontierData[0] = seedIndices.length; // initial frontier size.
    seedIndices.forEach((idx, i) => {
      frontierData[1 + i * 2] = idx; // cell index
      frontierData[1 + i * 2 + 1] = i; // seed index
    });
    this.device.queue.writeBuffer(this.frontierBuffers[0], 0, frontierData);
  }

  private async runComputePasses(): Promise<FloodFillResult> {
    const timeStart = performance.now();
    let currentFrontier = 0;
    let frontierSize = 1;

    while (frontierSize > 0) {
      // Reset the next frontier's atomic counter (first 4 bytes) to zero
      this.device.queue.writeBuffer(
        this.frontierBuffers[1 - currentFrontier],
        0,
        new Uint32Array([0])
      );

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroups[currentFrontier]);

      const workgroups = Math.ceil(frontierSize / 64);
      pass.dispatchWorkgroups(workgroups);

      pass.end();
      this.device.queue.submit([encoder.finish()]);

      // Read back frontier size from the next frontier buffer.
      frontierSize = await this.readFrontierSize(1 - currentFrontier);
      currentFrontier = 1 - currentFrontier;
    }
    const timeEnd = performance.now();
    console.info(`runComputePasses ${timeEnd - timeStart}ms`);
    // Once the fill is complete, simply retrieve the final filled state.
    return this.getFilledCells();
  }

  private async readFrontierSize(bufferIndex: number): Promise<number> {
    const readbackBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.frontierBuffers[bufferIndex],
      0,
      readbackBuffer,
      0,
      4
    );
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const size = new Uint32Array(readbackBuffer.getMappedRange())[0];
    readbackBuffer.unmap();

    return size;
  }

  private async getFilledCells(): Promise<FloodFillResult> {
    const timeStart = performance.now();
    // Precompute the total byte size so we don't repeat the multiplication.
    const totalBytes = this.config.maxCells * 4;

    // Create a readback buffer with MAP_READ and COPY_DST usages.
    const readbackBuffer = this.device.createBuffer({
      size: totalBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Encode the command to copy the contents of filledBuffer into the readbackBuffer.
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.filledBuffer,
      0,
      readbackBuffer,
      0,
      totalBytes
    );
    this.device.queue.submit([encoder.finish()]);

    // Wait for the GPU to finish and then map the readback buffer.
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const filled = new Uint32Array(readbackBuffer.getMappedRange());

    const resultMap = new Map<number, string[]>();

    // Iterate directly over this.h3Indices (assumed to be a Map)
    for (const [h3, idx] of this.h3Indices.entries()) {
      const seedIndex = filled[idx];
      if (seedIndex > 0) {
        const adjustedIndex = seedIndex - 1; // Account for the +1 added in the shader.
        if (!resultMap.has(adjustedIndex)) {
          resultMap.set(adjustedIndex, []);
        }
        resultMap.get(adjustedIndex)!.push(h3);
      }
    }

    // Unmap the buffer once done.
    readbackBuffer.unmap();

    const timeEnd = performance.now();
    console.info(`getFilledCells ${timeEnd - timeStart}ms`);

    // Construct the final result from the map without extra conversions.
    return Array.from(resultMap.entries(), ([seedIndex, cells]) => ({
      seedIndex,
      cells,
    }));
  }

  private getShaderCode(): string {
    return `
            struct CellNeighbors {
                indices: array<u32, 6>
            };

            struct FrontierItem {
              cell_idx: u32,
              seed_idx: u32
            };

            struct Frontier {
              size: atomic<u32>,
              items: array<FrontierItem>
            };

            @group(0) @binding(0) var<storage> neighbors: array<CellNeighbors>;
            @group(0) @binding(1) var<storage, read_write> filled: array<atomic<u32>>;
            @group(0) @binding(2) var<storage, read_write> currentFrontier: Frontier;
            @group(0) @binding(3) var<storage, read_write> nextFrontier: Frontier;
            @group(0) @binding(4) var<storage> seeds: array<u32>;

            @compute @workgroup_size(64)
            fn main(@builtin(global_invocation_id) id: vec3<u32>) {
                let idx = id.x;
                if (idx >= atomicLoad(&currentFrontier.size)) { return; }

                let item = currentFrontier.items[idx];
                let seed_idx = item.seed_idx;
                
                for (var i = 0u; i < 6u; i++) {
                    let neighbor = neighbors[item.cell_idx].indices[i];
                    if (neighbor == 0xFFFFFFFFu) { continue; }

                    // Only fill if cell is unclaimed (0)
                    if (atomicExchange(&filled[neighbor], seed_idx + 1u) == 0u) {
                        let next_idx = atomicAdd(&nextFrontier.size, 1u);
                        nextFrontier.items[next_idx] = FrontierItem(neighbor, seed_idx);
                    }
                }
            }
        `;
  }

  public async precomputeNeighbors(h3Cells: string[]) {
    this.h3Indices = new Map(h3Cells.map((h, i) => [h, i]));

    const neighborData = new Uint32Array(h3Cells.length * 6);
    neighborData.fill(0xffffffff);

    for (let i = 0, cellCount = h3Cells.length; i < cellCount; i++) {
      const cell = h3Cells[i];
      const candidates = h3.gridDisk(cell, 1);
      const baseIndex = i * 6;
      let validCount = 0;

      // Start from 1 to skip the center cell (first element)
      for (
        let j = 1, candCount = candidates.length; // CHANGED: Start at index 1
        j < candCount && validCount < 6;
        j++
      ) {
        const candidate = candidates[j];
        const neighborIndex = this.h3Indices.get(candidate);
        if (neighborIndex !== undefined) {
          neighborData[baseIndex + validCount] = neighborIndex;
          validCount++;
        }
      }
    }

    this.device.queue.writeBuffer(this.neighborBuffer, 0, neighborData);
  }

  public destroy() {
    [this.neighborBuffer, this.filledBuffer, ...this.frontierBuffers].forEach(
      (b) => b.destroy()
    );
  }

  public static configFromResolution(
    resolution: number,
    maxSeeds: number
  ): FloodFillConfig {
    const baseCells = RESOLUTION_CELL_FACTORS[resolution];
    if (!baseCells) {
      throw new Error(`Unsupported H3 resolution: ${resolution}. Valid 0-10`);
    }

    return {
      maxCells: baseCells,
      maxFrontierSize: Math.ceil(baseCells * 0.2), // 20% safety margin
      maxSeeds,
    };
  }

  public static configFromResolutionDynamic(
    res: number,
    maxSeeds: number
  ): FloodFillConfig {
    const maxCells = h3.getNumCells(res);
    return {
      maxCells,
      maxFrontierSize: Math.ceil(maxCells * 0.5), // Increased from 0.2 to 0.5
      maxSeeds,
    };
  }

  public static getAllH3Cells(resolution: number): string[] {
    const timeStart = performance.now();
    if (resolution < 0 || resolution > 5) {
      throw new Error("Resolution must be between 0 and 5");
    }
    if (resolution === 0) {
      return h3.getRes0Cells();
    }
    const baseCells = h3.getRes0Cells();
    const val = baseCells.flatMap((cell) =>
      h3.cellToChildren(cell, resolution)
    );
    const timeEnd = performance.now();
    console.info(`getAllH3Cells ${timeEnd - timeStart}ms`);
    return val;
  }
}
