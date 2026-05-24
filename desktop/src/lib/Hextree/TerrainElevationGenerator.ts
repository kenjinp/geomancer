import { GPUDevice } from "./WebGPU";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexPositionMapGenerator } from "../data-buffers/HexPositionMapGenerator";
import { HexTileBuffer } from "../data-buffers/HexTileBuffer";
import elevationShader from "./shaders/TerrainElevation.wgsl";

export class TerrainElevationGenerator {
  private device: globalThis.GPUDevice;
  private pipeline: GPUComputePipeline;
  private positionBuffer: GPUBuffer;
  private elevationBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;

  constructor(
    private tileBuffer: HexTileBuffer,
    private positionMap: HexPositionMapGenerator,
    private config: {
      octaves: number;
      persistence: number;
      scale: number;
      warpStrength: number;
      baseStrength: number;
      seed?: number;
    },
  ) {
    if (tileBuffer.resolution !== positionMap.metadata.resolution) {
      throw new Error(
        `Resolution mismatch between tile buffer (${tileBuffer.resolution}) and position map (${positionMap.metadata.resolution})`,
      );
    }

    // Debug: Log noise parameters
    console.log("Noise parameters:", {
      octaves: this.config.octaves,
      persistence: this.config.persistence,
      scale: this.config.scale,
      warpStrength: this.config.warpStrength,
      baseStrength: this.config.baseStrength,
    });
  }

  public static async create(
    tileBuffer: HexTileBuffer,
    positionMap: HexPositionMapGenerator,
    config: {
      octaves: number;
      persistence: number;
      scale: number;
      warpStrength: number;
      baseStrength: number;
      seed?: number;
    },
  ): Promise<TerrainElevationGenerator> {
    const instance = new TerrainElevationGenerator(tileBuffer, positionMap, config);
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
    const positions = new Float32Array(totalCells * 3);
    const positionData = this.positionMap.texture.image.data as Float32Array;

    for (let i = 0; i < totalCells; i++) {
      positions[i * 3] = positionData[i * 4];
      positions[i * 3 + 1] = positionData[i * 4 + 1];
      positions[i * 3 + 2] = positionData[i * 4 + 2];
    }

    this.positionBuffer = this.device.createBuffer({
      size: positions.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.device.queue.writeBuffer(this.positionBuffer, 0, positions);

    // Create elevation buffer with proper alignment
    const alignedBufferSize = Math.ceil((totalCells * 4) / 256) * 256;
    this.elevationBuffer = this.device.createBuffer({
      size: alignedBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 24, // 6 * f32 (octaves, persistence, seed, scale, warpStrength, baseStrength)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Update initial uniform data
    const uniformData = new Float32Array([
      this.config.seed,
      this.config.scale,
      this.config.warpStrength,
      this.config.baseStrength,
      this.config.persistence,
      this.config.octaves,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  private async createPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: elevationShader,
    });

    // Create explicit bind group layout
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
          buffer: { type: "storage" },
        },
        {
          binding: 2,
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
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.elevationBuffer } },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  public async generateElevations(): Promise<void> {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);
    const workgroupSize = 256;
    const numWorkgroups = Math.ceil(totalCells / workgroupSize);

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(numWorkgroups);
    pass.end();

    await this.device.queue.submit([encoder.finish()]);
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
    encoder.copyBufferToBuffer(this.elevationBuffer, 0, readbackBuffer, 0, alignedBufferSize);
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const elevations = new Float32Array(readbackBuffer.getMappedRange());

    // Add validation
    if (elevations.length < totalCells) {
      throw new Error(
        `Elevation buffer size mismatch. Expected at least ${totalCells} elements, got ${elevations.length}`,
      );
    }

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
    [this.positionBuffer, this.elevationBuffer].forEach((b) => b.destroy());
  }
}
