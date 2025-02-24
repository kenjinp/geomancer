import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexNeighborMapGenerator } from "../coordinate-systems/hex/maps/HexNeighborMapGenerator";
import { CrustSubtype, HexTileBuffer } from "./HexTileBuffer";
import { GPUDevice } from "./WebGPU";
import continentalGrowthShader from "./shaders/ContinentalGrowth.wgsl";

export class ContinentalGrowth {
  private device: globalThis.GPUDevice;
  private pipeline: GPUComputePipeline;
  private neighborBuffer: GPUBuffer;
  private crustTypeBuffer: GPUBuffer;
  private frontierBuffers: [GPUBuffer, GPUBuffer];
  private bindGroups: GPUBindGroup[] = [];
  private uniformBuffer: GPUBuffer;
  private totalCells: number;
  private targetLandCells: number;
  private plateIDBuffer: GPUBuffer;

  constructor(
    private tileBuffer: HexTileBuffer,
    private neighborMap: HexNeighborMapGenerator,
    private config: {
      platePercentage: number;
      seedPercentage: number;
      landPercentage: number;
      growthProbability: number;
    }
  ) {
    this.totalCells = HexGrid.getNumCells(tileBuffer.resolution);
    this.targetLandCells = Math.floor(this.totalCells * config.landPercentage);
  }

  public static async create(
    tileBuffer: HexTileBuffer,
    neighborMap: HexNeighborMapGenerator,
    config: {
      platePercentage: number;
      seedPercentage: number;
      landPercentage: number;
      growthProbability: number;
    }
  ): Promise<ContinentalGrowth> {
    const instance = new ContinentalGrowth(tileBuffer, neighborMap, config);
    await instance.initialize();
    return instance;
  }

  private async initialize() {
    this.device = await GPUDevice.create();
    await this.createBuffers();
    await this.createPipeline();
    await this.initializeSeeds();
  }

  private async createBuffers() {
    // Add plate ID buffer
    const plateIDs = new Uint32Array(this.totalCells);
    const h3Cells = HexGrid.allNodes(this.tileBuffer.resolution);
    h3Cells.forEach((_, i) => {
      plateIDs[i] = this.tileBuffer.readTileData(i).tectonicPlate;
    });

    this.plateIDBuffer = this.device.createBuffer({
      size: plateIDs.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.plateIDBuffer, 0, plateIDs);

    // Neighbor buffer (same as floodfill)
    const neighborData = await this.createNeighborData();
    this.neighborBuffer = this.device.createBuffer({
      size: neighborData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.neighborBuffer, 0, neighborData);

    // Crust type buffer (maps to tile buffer's integer texture)
    this.crustTypeBuffer = this.device.createBuffer({
      size: this.totalCells * 4,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });

    // Frontier buffers
    const frontierSize = Math.ceil(this.totalCells * 0.1);
    this.frontierBuffers = [
      this.createFrontierBuffer(frontierSize),
      this.createFrontierBuffer(frontierSize),
    ];

    // Uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 12, // u32 (4) + u32 (4) + f32 (4) = 12 bytes
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
  }

  private createFrontierBuffer(size: number): GPUBuffer {
    return this.device.createBuffer({
      size: 4 + size * 8,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
  }

  private async createNeighborData(): Promise<ArrayBuffer> {
    const h3Cells = HexGrid.allNodes(this.tileBuffer.resolution);
    const neighborData = new Uint32Array(h3Cells.length * 6);

    // Similar neighbor mapping logic as FloodFill
    const textureData = this.neighborMap.texture.image.data;
    for (let i = 0; i < h3Cells.length; i++) {
      for (let j = 0; j < 6; j++) {
        const pixelOffset = (i * 6 + j) * 4;
        const r = textureData[pixelOffset] / 255;
        const g = textureData[pixelOffset + 1] / 255;
        const b = textureData[pixelOffset + 2] / 255;
        const neighborIndex = HexGrid.decodeColorToNodeIndex([r, g, b, 1]);
        neighborData[i * 6 + j] = neighborIndex ?? 0xffffffff;
      }
    }
    return neighborData.buffer;
  }

  private async createPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: continentalGrowthShader,
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
        { binding: 1, resource: { buffer: this.crustTypeBuffer } },
        {
          binding: 2,
          resource: { buffer: this.frontierBuffers[frontierIndex] },
        },
        {
          binding: 3,
          resource: { buffer: this.frontierBuffers[1 - frontierIndex] },
        },
        {
          binding: 4,
          resource: {
            buffer: this.uniformBuffer,
            offset: 0,
            size: 12, // Match the buffer size
          },
        },
        { binding: 5, resource: { buffer: this.plateIDBuffer } },
      ],
    });
  }

  private async initializeSeeds() {
    // Select plates
    const allPlates = this.getUniquePlates();
    const selectedPlates = this.selectRandomSubset(
      allPlates,
      this.config.platePercentage
    );

    // Select seeds within plates
    const seedIndices: number[] = [];
    for (const plate of selectedPlates) {
      const plateCells = this.getCellsForPlate(plate);
      const seeds = this.selectRandomSubset(
        plateCells,
        this.config.seedPercentage
      );
      seedIndices.push(...seeds);
    }

    // Initialize frontier
    const frontierData = new Uint32Array(1 + seedIndices.length * 2);
    frontierData[0] = seedIndices.length;
    seedIndices.forEach((idx, i) => {
      frontierData[1 + i * 2] = idx;
      frontierData[1 + i * 2 + 1] = 0; // seed index not used here
    });
    this.device.queue.writeBuffer(this.frontierBuffers[0], 0, frontierData);

    // Initialize crust types for seeds
    const crustTypeData = new Uint32Array(this.totalCells).fill(0);
    seedIndices.forEach((idx) => (crustTypeData[idx] = 1));
    this.device.queue.writeBuffer(
      this.crustTypeBuffer,
      0,
      crustTypeData.buffer
    );

    // Initialize uniform buffer
    const uniformData = new ArrayBuffer(12);
    const uniformView = new DataView(uniformData);
    uniformView.setUint32(0, seedIndices.length, true); // initial land count
    uniformView.setUint32(4, this.targetLandCells, true);
    uniformView.setFloat32(8, this.config.growthProbability, true);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  private getUniquePlates(): number[] {
    const plates = new Set<number>();
    const h3Cells = HexGrid.allNodes(this.tileBuffer.resolution);
    h3Cells.forEach((cell) => {
      const idx = HexGrid.getIndex(cell);
      if (idx !== undefined) {
        plates.add(this.tileBuffer.readTileData(idx).tectonicPlate);
      }
    });
    return Array.from(plates);
  }

  private selectRandomSubset<T>(items: T[], percentage: number): T[] {
    const count = Math.ceil(items.length * percentage);
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private getCellsForPlate(plateId: number): number[] {
    const cells: number[] = [];
    const h3Cells = HexGrid.allNodes(this.tileBuffer.resolution);
    h3Cells.forEach((cell) => {
      const idx = HexGrid.getIndex(cell);
      if (
        idx !== undefined &&
        this.tileBuffer.readTileData(idx).tectonicPlate === plateId
      ) {
        cells.push(idx);
      }
    });
    return cells;
  }

  public async growContinents(): Promise<void> {
    const timeStart = performance.now();
    console.log("growing continents");
    let currentFrontier = 0;
    let frontierSize = await this.getFrontierSize(0);

    while (frontierSize > 0) {
      // Reset next frontier size before dispatch
      this.device.queue.writeBuffer(
        this.frontierBuffers[1 - currentFrontier],
        0,
        new Uint32Array([0])
      );

      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroups[currentFrontier]);
      pass.dispatchWorkgroups(Math.ceil(frontierSize / 256));
      pass.end();
      this.device.queue.submit([encoder.finish()]);

      frontierSize = await this.getFrontierSize(1 - currentFrontier);
      currentFrontier = 1 - currentFrontier;

      // Check if we've reached target
      const currentLand = await this.readLandCount();
      // const targetPercentage = this.targetLandCells / this.totalCells;
      // const currentPercentage = currentLand / this.totalCells;
      // console.log("current land progress", {
      //   currentPercentage,
      //   targetPercentage,
      // });
      if (currentLand >= this.targetLandCells) break;
    }
    const timeEnd = performance.now();
    console.log(`growing continents ${timeEnd - timeStart}ms`);

    await this.updateTileBuffer();
  }

  private async getFrontierSize(bufferIndex: number): Promise<number> {
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

  private async readLandCount(): Promise<number> {
    const readbackBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.uniformBuffer, 0, readbackBuffer, 0, 4);
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const count = new Uint32Array(readbackBuffer.getMappedRange())[0];
    readbackBuffer.unmap();
    return count;
  }

  private async updateTileBuffer(): Promise<void> {
    const readbackBuffer = this.device.createBuffer({
      size: this.crustTypeBuffer.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.crustTypeBuffer,
      0,
      readbackBuffer,
      0,
      this.crustTypeBuffer.size
    );
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const crustTypes = new Uint32Array(readbackBuffer.getMappedRange());

    const h3Cells = HexGrid.allNodes(this.tileBuffer.resolution);
    h3Cells.forEach((_, i) => {
      if (crustTypes[i] === 1) {
        const data = this.tileBuffer.readTileData(i);
        this.tileBuffer.updateTileData(i, {
          ...data,
          crustType: "continental",
          crustSubtype: this.randomCrustSubtype(),
        });
      }
    });
    readbackBuffer.unmap();
  }

  private randomCrustSubtype(): CrustSubtype {
    const subtypes: CrustSubtype[] = [
      "shield",
      "platform",
      "orogen",
      "basin",
      "large_igneous",
      "extended",
    ];
    return subtypes[Math.floor(Math.random() * subtypes.length)];
  }

  public destroy() {
    [
      this.neighborBuffer,
      this.crustTypeBuffer,
      ...this.frontierBuffers,
      this.uniformBuffer,
      this.plateIDBuffer,
    ].forEach((b) => b.destroy());
  }
}
