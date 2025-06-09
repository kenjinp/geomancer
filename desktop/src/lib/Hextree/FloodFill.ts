import { getState } from "@/state/Context";
import * as h3 from "h3-js";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexNeighborMapGenerator } from "../data-buffers/HexNeighborMapGenerator";
import { HexTileBuffer } from "../data-buffers/HexTileBuffer";
import { Plate } from "../model/tectonics/Plate";
import { CollisionType } from "../model/tectonics/PlateCollision";
import { GPUDevice } from "./WebGPU";
import floodfillShader from "./shaders/Floodfill.wgsl";

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
  private plates: Plate[];
  private frontierSizeReadbackBuffers: GPUBuffer[];
  private filledReadbackBuffer: GPUBuffer;
  constructor(
    public readonly config: FloodFillConfig,
    public hexTileBuffer: HexTileBuffer
  ) {}

  public static async doFloodfill(
    resolution: number,
    hexTileBuffer: HexTileBuffer,
    neighborMap: HexNeighborMapGenerator,
    plates: Plate[]
  ) {
    const targetResolution = resolution;
    if (plates.length === 0) {
      throw new Error("No plates provided");
    }
    const seedCount = plates.length;
    const config = HexGridFloodFill.configFromResolutionDynamic(
      targetResolution,
      seedCount + 1
    );
    console.log("hex fill 1", config);
    const floodFill = await HexGridFloodFill.create(config, hexTileBuffer);
    floodFill.plates = plates;
    // Now get all H3 cells at the same resolution using HexGrid
    const h3Cells: string[] = HexGrid.allNodes(resolution);

    // Generate neighbor map
    console.log("hex fill 2 (generating neighbor map)");
    const timeStart = performance.now();
    await floodFill.initializeFromNeighborMap(neighborMap, h3Cells);
    const timeEnd = performance.now();
    console.log(`hex fill 3: neighbor map generation ${timeEnd - timeStart}ms`);

    // choose random cells
    const seedCells: string[] = [];
    const pickedIndices = new Set<number>();
    while (seedCells.length < seedCount) {
      const randomIndex = Math.floor(
        getState().random.seededRandom.next() * h3Cells.length
      );
      if (!pickedIndices.has(randomIndex)) {
        pickedIndices.add(randomIndex);
        seedCells.push(h3Cells[randomIndex]);
      }
    }

    console.log("hex fill 4 (seedCells)", seedCells);
    const timeStart2 = performance.now();
    await floodFill.fill(seedCells);
    const timeEnd2 = performance.now();
    console.log(`hex fill 5: fill ${timeEnd2 - timeStart2}ms`);

    floodFill.destroy();
    console.log("hex fill 6 destroy");

    return floodFill;
  }

  public static async create(
    config: FloodFillConfig,
    hexTileBuffer: HexTileBuffer
  ): Promise<HexGridFloodFill> {
    const instance = new HexGridFloodFill(config, hexTileBuffer);
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

    // Add persistent readback buffers for frontier sizes
    this.frontierSizeReadbackBuffers = [
      this.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
      this.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
    ];

    // Add persistent readback buffer for final results
    this.filledReadbackBuffer = this.device.createBuffer({
      size: this.config.maxCells * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
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

  getShader() {
    return floodfillShader;
  }

  private async createPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: this.getShader(),
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
    const seedIndices = seedCells.map((cell) => {
      const index = HexGrid.getIndex(cell);
      if (index === undefined) {
        throw new Error(`One or more invalid seed cells, from ${cell}`);
      }
      return index;
    });

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
    const MAX_PASSES_WITHOUT_SYNC = 3; // Batch several passes before syncing

    while (frontierSize > 0) {
      // Number of passes to run before synchronizing
      const passesToRun = Math.min(
        MAX_PASSES_WITHOUT_SYNC,
        frontierSize > 0 ? 1 : 0
      );
      let lastRunFrontier = currentFrontier;

      for (let i = 0; i < passesToRun && frontierSize > 0; i++) {
        // Update uniform with current pass index
        this.device.queue.writeBuffer(
          this.uniformBuffer,
          0,
          new Uint32Array([passIndex])
        );

        // Reset the next frontier's atomic counter to zero
        this.device.queue.writeBuffer(
          this.frontierBuffers[1 - currentFrontier],
          0,
          new Uint32Array([0])
        );

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroups[currentFrontier]);

        const workgroups = Math.ceil(frontierSize / 256);
        pass.dispatchWorkgroups(workgroups);
        pass.end();

        // Copy frontier size to readback buffer for next iteration
        encoder.copyBufferToBuffer(
          this.frontierBuffers[1 - currentFrontier],
          0,
          this.frontierSizeReadbackBuffers[1 - currentFrontier],
          0,
          4
        );

        this.device.queue.submit([encoder.finish()]);

        // Update for next iteration within batch
        lastRunFrontier = 1 - currentFrontier;
        currentFrontier = lastRunFrontier;
        passIndex++;
      }

      // After batch, synchronize and check frontier size
      await this.frontierSizeReadbackBuffers[lastRunFrontier].mapAsync(
        GPUMapMode.READ
      );
      frontierSize = new Uint32Array(
        this.frontierSizeReadbackBuffers[lastRunFrontier].getMappedRange()
      )[0];
      this.frontierSizeReadbackBuffers[lastRunFrontier].unmap();
    }

    const timeEnd = performance.now();
    console.info(
      `runComputePasses ${timeEnd - timeStart}ms with ${passIndex} passes`
    );

    return this.getFilledCells();
  }

  private async readFrontierSize(bufferIndex: number): Promise<number> {
    // Use the persistent buffer instead of creating new ones
    await this.frontierSizeReadbackBuffers[bufferIndex].mapAsync(
      GPUMapMode.READ
    );
    const size = new Uint32Array(
      this.frontierSizeReadbackBuffers[bufferIndex].getMappedRange()
    )[0];
    this.frontierSizeReadbackBuffers[bufferIndex].unmap();
    return size;
  }

  private async getFilledCells(): Promise<HexTileBuffer> {
    const timeStart = performance.now();

    // Encode the command to copy the contents of filledBuffer into the persistent readbackBuffer
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.filledBuffer,
      0,
      this.filledReadbackBuffer,
      0,
      this.config.maxCells * 4
    );
    this.device.queue.submit([encoder.finish()]);

    // Wait for the GPU to finish and then map the readback buffer
    await this.filledReadbackBuffer.mapAsync(GPUMapMode.READ);
    const filled = new Uint32Array(this.filledReadbackBuffer.getMappedRange());

    const resultMap = new Map<number, string[]>();
    const plates = this.plates;

    // Create a batch of updates for better performance
    const tileUpdates: { index: number; data: any }[] = [];

    // Process the results
    for (const [h3, idx] of HexGrid.indexMap.entries()) {
      const seedIndex = filled[idx];
      if (seedIndex > 0) {
        const adjustedIndex = seedIndex - 1; // Account for the +1 added in the shader
        if (!resultMap.has(adjustedIndex)) {
          resultMap.set(adjustedIndex, []);
        }
        const plate = plates[adjustedIndex];
        resultMap.get(adjustedIndex)!.push(h3);

        // Add to batch instead of immediate update
        tileUpdates.push({
          index: HexGrid.getIndex(h3),
          data: {
            hasHotSpot: false,
            tectonicPlate: adjustedIndex,
            crustType: "oceanic",
            crustSubtype: "undefined",
            evapotranspiration: 0,
            annualPrecipitation: 0,
            annualTemperature: 0,
            biome: "undefined",
            elevation: plate.oceanElevation,
            isPlateBoundary: false,
            collidingPlate: 0,
            collisionType: CollisionType.NONE,
            collisionIntensity: 0,
          },
        });
      }
    }

    // Apply batch updates
    const BATCH_SIZE = 1000;
    console.log(
      `Applying ${tileUpdates.length} tile updates in batches of ${BATCH_SIZE}`
    );
    for (let i = 0; i < tileUpdates.length; i += BATCH_SIZE) {
      const batch = tileUpdates.slice(i, i + BATCH_SIZE);
      for (const update of batch) {
        this.hexTileBuffer.updateTileData(update.index, update.data);
      }
      // Allow UI updates between batches if needed
      if (i + BATCH_SIZE < tileUpdates.length) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    // Unmap the buffer once done
    this.filledReadbackBuffer.unmap();

    const timeEnd = performance.now();
    console.info(`getFilledCells ${timeEnd - timeStart}ms`);

    return this.hexTileBuffer;
  }

  public async initializeFromNeighborMap(
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
    [
      this.neighborBuffer,
      this.filledBuffer,
      ...this.frontierBuffers,
      ...this.frontierSizeReadbackBuffers,
      this.filledReadbackBuffer,
    ].forEach((b) => b.destroy());
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
      maxFrontierSize: Math.ceil(baseCells * 5), // 20% safety margin
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
      maxFrontierSize: Math.ceil(maxCells * 5),
      maxSeeds,
      resolution,
    };
  }

  public static getAllH3Cells(resolution: number): string[] {
    // Use HexGrid's method instead
    return HexGrid.allNodes(resolution);
  }
}
