import thermalErosionShader from "./shaders/ThermalErosion.wgsl";
import { GPUDevice } from "./WebGPU";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexTileBuffer } from "../data-buffers/HexTileBuffer";

export interface ThermalErosionConfig {
  iterations: number; // Number of erosion passes
  talus: number; // Critical slope threshold (tangent)
  erosionRate: number; // Rate at which material moves downslope
  smoothingFactor: number; // Amount of smoothing to apply
  seed?: number; // Optional seed for randomness
}

export class ThermalErosionSimulator {
  private device: globalThis.GPUDevice;
  private pipeline: GPUComputePipeline;
  private elevationBuffer: GPUBuffer;
  private neighborBuffer: GPUBuffer;
  private outputBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(
    private tileBuffer: HexTileBuffer,
    private neighborMap: Float32Array | Uint32Array,
    private config: ThermalErosionConfig,
  ) {
    // Debug: Log erosion parameters
    console.log("Thermal erosion parameters:", {
      iterations: this.config.iterations,
      talus: this.config.talus,
      erosionRate: this.config.erosionRate,
      smoothingFactor: this.config.smoothingFactor,
      seed: this.config.seed,
    });
  }

  public static async create(
    tileBuffer: HexTileBuffer,
    neighborMap: Float32Array | Uint32Array,
    config: ThermalErosionConfig,
  ): Promise<ThermalErosionSimulator> {
    const instance = new ThermalErosionSimulator(tileBuffer, neighborMap, config);
    await instance.initialize();
    return instance;
  }

  private async initialize() {
    this.device = await GPUDevice.create();
    await this.createBuffers();
    await this.createPipeline();
  }

  private async createBuffers() {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);

    // Create elevation buffer
    const elevations = new Float32Array(totalCells);

    // Extract current elevations from tile buffer
    for (let i = 0; i < totalCells; i++) {
      const tileData = this.tileBuffer.readTileData(i);
      elevations[i] = tileData.elevation;
    }

    // Create GPU buffers
    this.elevationBuffer = this.device.createBuffer({
      size: elevations.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.elevationBuffer, 0, elevations);

    // Create buffer for neighbor indices
    this.neighborBuffer = this.device.createBuffer({
      size: this.neighborMap.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.neighborBuffer, 0, this.neighborMap);

    // Create output buffer for erosion results
    const alignedBufferSize = Math.ceil((totalCells * 4) / 256) * 256;
    this.outputBuffer = this.device.createBuffer({
      size: alignedBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create uniform buffer for erosion parameters
    this.uniformBuffer = this.device.createBuffer({
      size: 20, // 5 * f32 (iterations, talus, erosionRate, smoothingFactor, seed)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Update uniform data
    const uniformData = new Float32Array([
      this.config.iterations,
      this.config.talus,
      this.config.erosionRate,
      this.config.smoothingFactor,
      this.config.seed,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  private async createPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: thermalErosionShader,
    });

    // Create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout],
      }),
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.elevationBuffer } },
        { binding: 1, resource: { buffer: this.neighborBuffer } },
        { binding: 2, resource: { buffer: this.outputBuffer } },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  public async applyErosion(): Promise<void> {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);
    const workgroupSize = 256;
    const numWorkgroups = Math.ceil(totalCells / workgroupSize);

    // Apply multiple iterations of erosion
    for (let i = 0; i < this.config.iterations; i++) {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(numWorkgroups);
      pass.end();

      await this.device.queue.submit([encoder.finish()]);

      // For multiple iterations, we need to copy the output back to the input
      if (i < this.config.iterations - 1) {
        const copyEncoder = this.device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(
          this.outputBuffer,
          0,
          this.elevationBuffer,
          0,
          totalCells * 4,
        );
        this.device.queue.submit([copyEncoder.finish()]);
      }
    }

    await this.updateTileBuffer();
  }

  private async updateTileBuffer(): Promise<void> {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);
    const alignedBufferSize = Math.ceil((totalCells * 4) / 256) * 256;

    const readbackBuffer = this.device.createBuffer({
      size: alignedBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.outputBuffer, 0, readbackBuffer, 0, alignedBufferSize);
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const elevations = new Float32Array(readbackBuffer.getMappedRange());

    // Validate buffer size
    if (elevations.length < totalCells) {
      throw new Error(
        `Elevation buffer size mismatch. Expected at least ${totalCells} elements, got ${elevations.length}`,
      );
    }

    // Update the tile buffer with eroded elevations
    for (let i = 0; i < totalCells; i++) {
      const data = this.tileBuffer.readTileData(i);
      this.tileBuffer.updateTileData(i, {
        ...data,
        elevation: elevations[i],
      });
    }

    readbackBuffer.unmap();
    readbackBuffer.destroy();
  }

  public destroy() {
    [this.elevationBuffer, this.neighborBuffer, this.outputBuffer, this.uniformBuffer].forEach(
      (b) => b.destroy(),
    );
  }
}
