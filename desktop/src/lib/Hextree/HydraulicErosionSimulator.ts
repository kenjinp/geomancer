import hydraulicErosionShader from "./shaders/HydraulicErosion.wgsl";
import { GPUDevice } from "./WebGPU";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexTileBuffer } from "../data-buffers/HexTileBuffer";

export interface HydraulicErosionConfig {
  iterations: number; // Number of erosion passes
  rainAmount: number; // Amount of rain per iteration
  evaporationRate: number; // Rate of water evaporation
  sedimentCapacity: number; // Max sediment water can carry (based on slope)
  solubility: number; // Rate of sediment dissolution
  depositionRate: number; // Rate at which sediment is deposited
  seed?: number; // Optional seed for randomness
}

export class HydraulicErosionSimulator {
  private device: globalThis.GPUDevice;
  private pipeline: GPUComputePipeline;
  private elevationBuffer: GPUBuffer;
  private waterBuffer: GPUBuffer;
  private sedimentBuffer: GPUBuffer;
  private neighborBuffer: GPUBuffer;
  private outputBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(
    private tileBuffer: HexTileBuffer,
    private neighborMap: Float32Array | Uint32Array,
    private config: HydraulicErosionConfig
  ) {
    // Debug: Log erosion parameters
    console.log("Hydraulic erosion parameters:", {
      iterations: this.config.iterations,
      rainAmount: this.config.rainAmount,
      evaporationRate: this.config.evaporationRate,
      sedimentCapacity: this.config.sedimentCapacity,
      solubility: this.config.solubility,
      depositionRate: this.config.depositionRate,
      seed: this.config.seed,
    });
  }

  public static async create(
    tileBuffer: HexTileBuffer,
    neighborMap: Float32Array | Uint32Array,
    config: HydraulicErosionConfig
  ): Promise<HydraulicErosionSimulator> {
    const instance = new HydraulicErosionSimulator(
      tileBuffer,
      neighborMap,
      config
    );
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

    // Create initial water and sediment buffers (all zeroes initially)
    const waterLevels = new Float32Array(totalCells).fill(0);
    const sedimentLevels = new Float32Array(totalCells).fill(0);

    // Create GPU buffers
    this.elevationBuffer = this.device.createBuffer({
      size: elevations.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.elevationBuffer, 0, elevations);

    this.waterBuffer = this.device.createBuffer({
      size: waterLevels.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
    this.device.queue.writeBuffer(this.waterBuffer, 0, waterLevels);

    this.sedimentBuffer = this.device.createBuffer({
      size: sedimentLevels.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    });
    this.device.queue.writeBuffer(this.sedimentBuffer, 0, sedimentLevels);

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
      size: 32, // 8 * f32 (iterations, rainAmount, evaporationRate, sedimentCapacity, solubility, depositionRate, seed, padding)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Update uniform data
    const uniformData = new Float32Array([
      this.config.iterations,
      this.config.rainAmount,
      this.config.evaporationRate,
      this.config.sedimentCapacity,
      this.config.solubility,
      this.config.depositionRate,
      this.config.seed,
      0.0, // padding for alignment
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
  }

  private async createPipeline() {
    const shaderModule = this.device.createShaderModule({
      code: hydraulicErosionShader,
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
          buffer: { type: "storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 5,
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
        { binding: 1, resource: { buffer: this.waterBuffer } },
        { binding: 2, resource: { buffer: this.sedimentBuffer } },
        { binding: 3, resource: { buffer: this.neighborBuffer } },
        { binding: 4, resource: { buffer: this.outputBuffer } },
        { binding: 5, resource: { buffer: this.uniformBuffer } },
      ],
    });
  }

  public async applyErosion(): Promise<void> {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);
    const workgroupSize = 256;
    const numWorkgroups = Math.ceil(totalCells / workgroupSize);

    // Apply multiple iterations of hydraulic erosion
    for (let i = 0; i < this.config.iterations; i++) {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.dispatchWorkgroups(numWorkgroups);
      pass.end();

      await this.device.queue.submit([encoder.finish()]);

      // For multiple iterations, we need to swap buffers
      if (i < this.config.iterations - 1) {
        // First, we need to read back the current water and sediment levels to calculate transfers
        // This simulates the part that the shader no longer does due to atomics limitations
        await this.processWaterTransfers();

        const copyEncoder = this.device.createCommandEncoder();

        // Copy output elevations back to the input buffer
        copyEncoder.copyBufferToBuffer(
          this.outputBuffer,
          0,
          this.elevationBuffer,
          0,
          totalCells * 4
        );

        this.device.queue.submit([copyEncoder.finish()]);
      }
    }

    await this.updateTileBuffer();
  }

  // Handle water transfers between iterations
  private async processWaterTransfers(): Promise<void> {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);
    const alignedBufferSize = Math.ceil((totalCells * 4) / 256) * 256;

    try {
      // 1. Read back water, sediment and elevation buffers
      // Create temporary buffers for reading data from GPU
      const waterReadbackBuffer = this.device.createBuffer({
        size: alignedBufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const sedimentReadbackBuffer = this.device.createBuffer({
        size: alignedBufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      const elevationReadbackBuffer = this.device.createBuffer({
        size: alignedBufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });

      // Set up the copy operations
      const encoder = this.device.createCommandEncoder();
      encoder.copyBufferToBuffer(
        this.waterBuffer,
        0,
        waterReadbackBuffer,
        0,
        totalCells * 4
      );
      encoder.copyBufferToBuffer(
        this.sedimentBuffer,
        0,
        sedimentReadbackBuffer,
        0,
        totalCells * 4
      );
      encoder.copyBufferToBuffer(
        this.outputBuffer,
        0,
        elevationReadbackBuffer,
        0,
        totalCells * 4
      );
      this.device.queue.submit([encoder.finish()]);

      // Map buffers to read the data
      await waterReadbackBuffer.mapAsync(GPUMapMode.READ);
      await sedimentReadbackBuffer.mapAsync(GPUMapMode.READ);
      await elevationReadbackBuffer.mapAsync(GPUMapMode.READ);

      const currentWater = new Float32Array(
        waterReadbackBuffer.getMappedRange()
      );
      const currentSediment = new Float32Array(
        sedimentReadbackBuffer.getMappedRange()
      );
      const currentElevations = new Float32Array(
        elevationReadbackBuffer.getMappedRange()
      );

      // Create arrays to store the updated values
      const newWater = new Float32Array(totalCells);
      const newSediment = new Float32Array(totalCells);

      // Copy current values to start with
      for (let i = 0; i < totalCells; i++) {
        newWater[i] = currentWater[i];
        newSediment[i] = currentSediment[i];
      }

      // 2. Calculate water flow between cells for each cell
      // This is the part that would normally be done in the shader using atomics
      // We'll do a similar calculation but on the CPU

      const neighborMapData = new Uint32Array(this.neighborMap.buffer);

      for (let cellIdx = 0; cellIdx < totalCells; cellIdx++) {
        const cellElevation = currentElevations[cellIdx];
        const cellWater = currentWater[cellIdx];
        const cellSediment = currentSediment[cellIdx];

        if (cellWater <= 0.001) continue; // Skip cells with no water

        // Current water surface level
        const cellWaterLevel = cellElevation + cellWater;

        // Track total outflow and valid neighbors
        let totalOutflow = 0;
        const outflows = new Array(6).fill(0);

        // Check each neighbor for possible water flow
        const neighborBaseIdx = cellIdx * 6; // 6 neighbors per hex

        // First pass: calculate outflows to all neighbors
        for (let i = 0; i < 6; i++) {
          const neighborIdx = neighborMapData[neighborBaseIdx + i];

          // Skip invalid neighbors
          if (neighborIdx === 0xffffffff || neighborIdx >= totalCells) {
            continue;
          }

          const neighborElevation = currentElevations[neighborIdx];
          const neighborWater = currentWater[neighborIdx];
          const neighborWaterLevel = neighborElevation + neighborWater;

          // Only flow if current water level is higher than neighbor's
          if (cellWaterLevel > neighborWaterLevel) {
            const heightDiff = cellWaterLevel - neighborWaterLevel;
            // Flow rate based on height difference (similar to shader)
            const flow = Math.min(heightDiff * 0.4, cellWater);
            outflows[i] = flow;
            totalOutflow += flow;
          }
        }

        // Adjust outflows if total exceeds available water
        if (totalOutflow > cellWater && totalOutflow > 0) {
          const scale = cellWater / totalOutflow;
          for (let i = 0; i < 6; i++) {
            outflows[i] *= scale;
          }
          totalOutflow = cellWater;
        }

        // Only proceed if we have outflow
        if (totalOutflow > 0) {
          // Calculate how much sediment moves with the water
          // Distribute proportionally to outflow
          for (let i = 0; i < 6; i++) {
            if (outflows[i] > 0) {
              const neighborIdx = neighborMapData[neighborBaseIdx + i];

              if (neighborIdx !== 0xffffffff && neighborIdx < totalCells) {
                // Calculate sediment amount to move (proportional to water flow)
                const sedimentAmount =
                  cellSediment * (outflows[i] / totalOutflow);

                // Update water and sediment levels
                newWater[neighborIdx] += outflows[i];
                newSediment[neighborIdx] += sedimentAmount;

                // Remove from current cell
                newWater[cellIdx] -= outflows[i];
                newSediment[cellIdx] -= sedimentAmount;
              }
            }
          }
        }
      }

      // 3. Update GPU buffers with new water and sediment values
      const waterUploadEncoder = this.device.createCommandEncoder();
      this.device.queue.writeBuffer(this.waterBuffer, 0, newWater);
      this.device.queue.writeBuffer(this.sedimentBuffer, 0, newSediment);

      // Submit the commands to update the buffers
      this.device.queue.submit([waterUploadEncoder.finish()]);

      // Clean up
      waterReadbackBuffer.unmap();
      sedimentReadbackBuffer.unmap();
      elevationReadbackBuffer.unmap();

      waterReadbackBuffer.destroy();
      sedimentReadbackBuffer.destroy();
      elevationReadbackBuffer.destroy();

      console.log("Water and sediment transfers processed");
    } catch (error) {
      console.error("Error processing water transfers:", error);
    }
  }

  private async updateTileBuffer(): Promise<void> {
    const totalCells = HexGrid.getNumCells(this.tileBuffer.resolution);
    const alignedBufferSize = Math.ceil((totalCells * 4) / 256) * 256;

    const readbackBuffer = this.device.createBuffer({
      size: alignedBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.outputBuffer,
      0,
      readbackBuffer,
      0,
      alignedBufferSize
    );
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const elevations = new Float32Array(readbackBuffer.getMappedRange());

    // Validate buffer size
    if (elevations.length < totalCells) {
      throw new Error(
        `Elevation buffer size mismatch. Expected at least ${totalCells} elements, got ${elevations.length}`
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
    [
      this.elevationBuffer,
      this.waterBuffer,
      this.sedimentBuffer,
      this.neighborBuffer,
      this.outputBuffer,
      this.uniformBuffer,
    ].forEach((b) => b.destroy());
  }
}
