import * as h3 from "h3-js";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexNeighborMapGenerator } from "../coordinate-systems/hex/maps/HexNeighborMapGenerator";
import { HexTileBuffer } from "./HexTileBuffer";
import { GPUDevice } from "./WebGPU";

const RESOLUTION_CELL_FACTORS: Record<number, number> = {
  0: 122, // Base icosahedron cells
  1: 842,
  2: 5882,
  3: 41162,
  4: 288_122,
  5: 2_016_842,
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
  resolution: number;
  /**
   * Optionally supply a precomputed neighbor texture.
   * This texture should be square, using the same layout as produced by our export methods.
   */
  precomputedNeighborsTexture?: GPUTexture;
  /**
   * If using a precomputed neighbor texture, you may optionally supply its square size.
   * (If not supplied, your compute shader must derive it from the texture view.)
   */
  neighborsTextureSquareSize?: number;
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
  private bindGroups: GPUBindGroup[] = [];
  private seedBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private neighborTexture: GPUTexture;
  public hexTileBuffer: HexTileBuffer;

  private constructor(private config: FloodFillConfig) {
    this.hexTileBuffer = new HexTileBuffer(config.resolution);
  }

  public static async doFloodfill(resolution: number, seedCount: number) {
    const targetResolution = resolution;
    const config = HexGridFloodFill.configFromResolutionDynamic(
      targetResolution,
      seedCount + 1
    );

    console.log("hex fill 1", config);
    const floodFill = await HexGridFloodFill.create(config);

    // Now get all H3 cells at the same resolution using HexGrid
    const h3Cells: string[] = HexGrid.allNodes(resolution);

    // Generate neighbor map
    console.log("hex fill 2 (generating neighbor map)");
    const timeStart = performance.now();
    const neighborMap = await HexNeighborMapGenerator.loadFromWebP(
      "textures/hex/neighbor-map.webp",
      4
    );
    await floodFill.initializeFromNeighborMap(neighborMap, h3Cells);
    const timeEnd = performance.now();
    console.log(`hex fill 3: neighbor map generation ${timeEnd - timeStart}ms`);

    // choose random cells
    const seedCells: string[] = [];
    const pickedIndices = new Set<number>();
    while (seedCells.length < seedCount) {
      const randomIndex = Math.floor(Math.random() * h3Cells.length);
      if (!pickedIndices.has(randomIndex)) {
        pickedIndices.add(randomIndex);
        seedCells.push(h3Cells[randomIndex]);
      }
    }

    console.log("hex fill 4 (seedCells)", seedCells);
    const timeStart2 = performance.now();
    const result = await floodFill.fill(seedCells);
    const timeEnd2 = performance.now();
    console.log(`hex fill 5: fill ${timeEnd2 - timeStart2}ms`);

    floodFill.destroy();
    console.log("hex fill 6 destroy");

    return result;
  }

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

    // Add uniform buffer for pass index
    this.uniformBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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
        { binding: 5, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  public async fill(seedCells: string[]): Promise<HexTileBuffer> {
    const seedIndices = seedCells.map((cell) => HexGrid.getIndex(cell));
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

  public async runComputePasses(): Promise<HexTileBuffer> {
    const timeStart = performance.now();
    let currentFrontier = 0;
    let frontierSize = 1;
    let passIndex = 0;

    while (frontierSize > 0) {
      // Update uniform with current pass index
      this.device.queue.writeBuffer(
        this.uniformBuffer,
        0,
        new Uint32Array([passIndex])
      );

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
      passIndex++;
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

  private async getFilledCells(): Promise<HexTileBuffer> {
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
    for (const [h3, idx] of HexGrid.indexMap.entries()) {
      const seedIndex = filled[idx];
      if (seedIndex > 0) {
        const adjustedIndex = seedIndex - 1; // Account for the +1 added in the shader.
        if (!resultMap.has(adjustedIndex)) {
          resultMap.set(adjustedIndex, []);
        }
        resultMap.get(adjustedIndex)!.push(h3);
        this.hexTileBuffer.updateTileData(HexGrid.getIndex(h3), {
          hasHotSpot: false,
          tectonicPlate: adjustedIndex,
          crustType: "oceanic",
          crustSubtype: "undefined",
          evapotranspiration: 0,
          annualPrecipitation: 0,
          annualTemperature: 0,
          biome: "undefined",
        });
      }
    }

    // // Iterate directly over this.h3Indices (assumed to be a Map)
    // for (let idx = 0; idx < this.config.maxCells; idx++) {
    //   const seedIndex = filled[idx];
    //   if (seedIndex > 0) {
    //     const adjustedIndex = seedIndex - 1; // Account for the +1 added in the shader.
    // this.hexTileBuffer.updateTileData(adjustedIndex, {
    //   hasHotSpot: false,
    //   tectonicPlate: seedIndex,
    //   crustType: "oceanic",
    //   crustSubtype: "undefined",
    //   evapotranspiration: 0,
    //   annualPrecipitation: 0,
    //   annualTemperature: 0,
    //   biome: "undefined",
    // });
    //   }
    // }

    // Unmap the buffer once done.
    readbackBuffer.unmap();

    const timeEnd = performance.now();
    console.info(`getFilledCells ${timeEnd - timeStart}ms`);

    return this.hexTileBuffer;
  }

  private getShaderCode(): string {
    return `
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
                if (idx >= atomicLoad(&currentFrontier.size)) { return; }

                let item = currentFrontier.items[idx];
                let seed_idx = item.seed_idx;

                for (var i = 0u; i < 6u; i++) {
                    let candidate = neighbors[item.cell_idx].indices[i];
                    if (candidate == 0xFFFFFFFFu) { continue; }

                    // Only consider candidate if unclaimed
                    if (atomicLoad(&filled[candidate]) != 0u) { continue; }

                    // For the first two passes, allow unconditional expansion
                    var isContiguous: bool = (uniforms.passIndex <= 1u);
                    if (uniforms.passIndex > 1u) {
                        var contiguousFound: bool = false;
                        // Check candidate's neighbors (skip the expanding cell) for same seed
                        for (var j: u32 = 0u; j < 6u; j++) {
                            let nbr = neighbors[candidate].indices[j];
                            if (nbr == 0xFFFFFFFFu || nbr == item.cell_idx) { continue; }
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
        `;
  }

  private async initializeFromNeighborMap(
    neighborMap: HexNeighborMapGenerator,
    h3Cells: string[]
  ) {
    if (!neighborMap.texture) {
      throw new Error("Neighbor map texture not generated");
    }
    // Create a buffer to store neighbor data
    const neighborData = new Uint32Array(h3Cells.length * 6);
    neighborData.fill(0xffffffff);

    // Extract neighbor data from texture
    const textureData = neighborMap.texture.image.data;

    for (let i = 0; i < h3Cells.length; i++) {
      for (let j = 0; j < 6; j++) {
        const pixelOffset = (i * 6 + j) * 4;
        const r = textureData[pixelOffset] / 255;
        const g = textureData[pixelOffset + 1] / 255;
        const b = textureData[pixelOffset + 2] / 255;
        const neighborIndex = HexGrid.decodeColorToNodeIndex([r, g, b, 1]);
        neighborData[i * 6 + j] =
          neighborIndex === 0xffffff ? 0xffffffff : neighborIndex;
      }
    }

    // Write the neighbor data to the buffer
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
      resolution,
    };
  }

  public static configFromResolutionDynamic(
    resolution: number,
    maxSeeds: number
  ): FloodFillConfig {
    const maxCells = h3.getNumCells(resolution);
    return {
      maxCells,
      maxFrontierSize: Math.ceil(maxCells * 0.5), // Increased from 0.2 to 0.5
      maxSeeds,
      resolution,
    };
  }

  public static getAllH3Cells(resolution: number): string[] {
    // Use HexGrid's method instead
    return HexGrid.allNodes(resolution);
  }
}
