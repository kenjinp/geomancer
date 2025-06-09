import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexNeighborMapGenerator } from "../data-buffers/HexNeighborMapGenerator";
import { HexPositionMapGenerator } from "../data-buffers/HexPositionMapGenerator";
import { HexTileBuffer } from "../data-buffers/HexTileBuffer";
import { Plate } from "../model/tectonics/Plate";
import { CollisionType } from "../model/tectonics/PlateCollision";
import plateCollisionShader from "./shaders/PlateCollision.wgsl";

const WORKGROUP_SIZE = 64;

interface CollisionDetectionParams {
  convergentThreshold: number; // Threshold for detecting convergent boundaries
  divergentThreshold: number; // Threshold for detecting divergent boundaries
  transformThreshold: number; // Threshold for detecting transform boundaries
  seed: number; // Random seed for reproducibility
}

export class PlateCollisionDetector {
  private device: GPUDevice;
  private plateDataBuffer: GPUBuffer;
  private hexTileBuffer: HexTileBuffer;
  private neighborMapData: Uint8Array;
  private positionMapData: Float32Array;
  private plateCollisionPipeline: GPUComputePipeline;
  private plateCollisionBindGroup: GPUBindGroup;
  private plateInfoBuffer: GPUBuffer;
  private params: CollisionDetectionParams;
  private outputBuffer: GPUBuffer;
  private outputBufferStaging: GPUBuffer;
  private resultData: Uint32Array;
  private preDecodedNeighborBuffer: GPUBuffer;

  /**
   * Creates a PlateCollisionDetector instance
   */
  static async create(
    hexTileBuffer: HexTileBuffer,
    hexNeighborMap: HexNeighborMapGenerator,
    hexPositionMap: HexPositionMapGenerator,
    plates: Plate[],
    params: CollisionDetectionParams = {
      convergentThreshold: 0.001,
      divergentThreshold: -0.001,
      transformThreshold: 0.002,
      seed: Math.random(),
    }
  ): Promise<PlateCollisionDetector> {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("Couldn't request WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    if (!device) {
      throw new Error("Couldn't request WebGPU device");
    }

    const detector = new PlateCollisionDetector(
      device,
      hexTileBuffer,
      hexNeighborMap,
      hexPositionMap,
      plates,
      params
    );

    await detector.initialize();

    return detector;
  }

  private constructor(
    device: GPUDevice,
    hexTileBuffer: HexTileBuffer,
    hexNeighborMap: HexNeighborMapGenerator,
    hexPositionMap: HexPositionMapGenerator,
    plates: Plate[],
    params: CollisionDetectionParams
  ) {
    this.device = device;
    this.hexTileBuffer = hexTileBuffer;
    this.neighborMapData = new Uint8Array(
      hexNeighborMap.texture.image.data.buffer
    );
    this.positionMapData = new Float32Array(
      hexPositionMap.texture.image.data.buffer
    );
    this.params = params;

    // Create plate data buffer
    // Ensure we have at least one plate to avoid zero-sized buffers
    const platesCount = Math.max(plates.length, 1);
    const plateData = new Float32Array(platesCount * 8); // 8 floats per plate

    // Fill with default values first
    plateData.fill(0);

    // Then add actual plate data if available
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i];
      const baseIndex = i * 8;
      plateData[baseIndex] = plate.driftAxis.x;
      plateData[baseIndex + 1] = plate.driftAxis.y;
      plateData[baseIndex + 2] = plate.driftAxis.z;
      plateData[baseIndex + 3] = plate.driftRate;
      plateData[baseIndex + 4] = plate.landElevation;
      plateData[baseIndex + 5] = plate.oceanElevation;
      plateData[baseIndex + 6] = plate.growthBias;
      plateData[baseIndex + 7] = 0; // padding
    }

    // Verify buffer size is valid
    if (plateData.byteLength === 0) {
      throw new Error("Plate data buffer cannot have zero size");
    }

    this.plateDataBuffer = device.createBuffer({
      size: plateData.byteLength,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Float32Array(this.plateDataBuffer.getMappedRange()).set(plateData);
    this.plateDataBuffer.unmap();

    // Add preparation of neighbor data in a pre-decoded format
    this.preDecodedNeighborBuffer = device.createBuffer({
      size: this.createPreDecodedNeighbors(hexNeighborMap).byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(this.preDecodedNeighborBuffer.getMappedRange()).set(
      this.createPreDecodedNeighbors(hexNeighborMap)
    );
    this.preDecodedNeighborBuffer.unmap();
  }

  /**
   * Prepare neighbor data in a pre-decoded format similar to ContinentalGrowth
   */
  private createPreDecodedNeighbors(
    hexNeighborMap: HexNeighborMapGenerator
  ): Uint32Array {
    const h3Cells = HexGrid.allNodes(this.hexTileBuffer.resolution);
    const neighborData = new Uint32Array(h3Cells.length * 6);

    // Pre-decode the neighbors from the texture
    const textureData = hexNeighborMap.texture.image.data;
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
    return neighborData;
  }

  private async initialize(): Promise<void> {
    // Create buffer for simulation parameters
    this.plateInfoBuffer = this.device.createBuffer({
      size: 32, // 8 floats (4 bytes each)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const plateInfoArray = new Float32Array(
      this.plateInfoBuffer.getMappedRange()
    );
    plateInfoArray[0] = this.params.convergentThreshold;
    plateInfoArray[1] = this.params.divergentThreshold;
    plateInfoArray[2] = this.params.transformThreshold;
    plateInfoArray[3] = this.params.seed;
    plateInfoArray[4] = this.hexTileBuffer.getTextureSize().width;
    plateInfoArray[5] = this.hexTileBuffer.getTextureSize().height;
    plateInfoArray[6] = this.hexTileBuffer.resolution;
    plateInfoArray[7] = 0; // padding
    this.plateInfoBuffer.unmap();

    // Size of the hex buffer for the whole planet
    const hexSize =
      this.hexTileBuffer.getTextureSize().width *
      this.hexTileBuffer.getTextureSize().height;

    // Ensure we have at least some data to work with
    if (hexSize === 0) {
      throw new Error("Hex grid has zero size");
    }

    // Create the input buffer for neighbor map
    if (this.neighborMapData.byteLength === 0) {
      throw new Error("Neighbor map data has zero size");
    }

    const neighborMapBuffer = this.device.createBuffer({
      size: this.neighborMapData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint8Array(neighborMapBuffer.getMappedRange()).set(
      this.neighborMapData
    );
    neighborMapBuffer.unmap();

    // Create the input buffer for position map
    if (this.positionMapData.byteLength === 0) {
      throw new Error("Position map data has zero size");
    }

    const positionMapBuffer = this.device.createBuffer({
      size: this.positionMapData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(positionMapBuffer.getMappedRange()).set(
      this.positionMapData
    );
    positionMapBuffer.unmap();

    // Create input buffer for hex tile data
    const intData = new Uint32Array(
      this.hexTileBuffer.getIntegerTexture().image.data.buffer
    );

    if (intData.byteLength === 0) {
      throw new Error("Integer hex data has zero size");
    }

    const intBuffer = this.device.createBuffer({
      size: intData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint32Array(intBuffer.getMappedRange()).set(intData);
    intBuffer.unmap();

    const floatData = new Float32Array(
      this.hexTileBuffer.getFloatTexture().image.data.buffer
    );

    if (floatData.byteLength === 0) {
      throw new Error("Float hex data has zero size");
    }

    const floatBuffer = this.device.createBuffer({
      size: floatData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(floatBuffer.getMappedRange()).set(floatData);
    floatBuffer.unmap();

    // Add minimum size check for output buffers
    const minSize = 4; // Minimum 4 bytes

    // Create the output buffer for hex tile data (updated with collision info)
    const outputIntBuffer = this.device.createBuffer({
      size: Math.max(intData.byteLength, minSize),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
    });

    const outputFloatBuffer = this.device.createBuffer({
      size: Math.max(floatData.byteLength, minSize),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
    });

    // Create a buffer to store the collision boundary information
    const collisionBufferSize = Math.max(hexSize * 8 * 4, minSize);
    this.outputBuffer = this.device.createBuffer({
      size: collisionBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
    });

    // Create a staging buffer for reading the results
    this.outputBufferStaging = this.device.createBuffer({
      size: collisionBufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      mappedAtCreation: false,
    });

    // Create the shader module using the imported shader code
    const shaderModule = this.device.createShaderModule({
      code: plateCollisionShader,
    });

    // Create the pipeline
    this.plateCollisionPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              {
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "uniform" },
              },
              {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
              },
              {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
              },
              {
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
              },
              {
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
              },
              {
                binding: 5,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
              },
              {
                binding: 6,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
              },
              {
                binding: 7,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
              },
              {
                binding: 8,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
              },
            ],
          }),
        ],
      }),
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    // Create the bind group
    this.plateCollisionBindGroup = this.device.createBindGroup({
      layout: this.plateCollisionPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.plateInfoBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.plateDataBuffer },
        },
        {
          binding: 2,
          resource: { buffer: this.preDecodedNeighborBuffer },
        },
        {
          binding: 3,
          resource: { buffer: positionMapBuffer },
        },
        {
          binding: 4,
          resource: { buffer: intBuffer },
        },
        {
          binding: 5,
          resource: { buffer: floatBuffer },
        },
        {
          binding: 6,
          resource: { buffer: outputIntBuffer },
        },
        {
          binding: 7,
          resource: { buffer: outputFloatBuffer },
        },
        {
          binding: 8,
          resource: { buffer: this.outputBuffer },
        },
      ],
    });

    // Prepare result data array
    this.resultData = new Uint32Array(hexSize * 8);
  }

  /**
   * Run the plate collision detection
   */
  async detectCollisions(): Promise<{
    hexTileBuffer: HexTileBuffer;
    plateBoundaries: {
      hexIndex: number;
      plateA: number;
      plateB: number;
      collisionType: CollisionType;
      intensity: number;
    }[];
  }> {
    const plateDataArray = new Float32Array(this.plateDataBuffer.size / 4);
    const tmpStagingBuffer = this.device.createBuffer({
      size: this.plateDataBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const cmdEncoder = this.device.createCommandEncoder();
    cmdEncoder.copyBufferToBuffer(
      this.plateDataBuffer,
      0,
      tmpStagingBuffer,
      0,
      this.plateDataBuffer.size
    );
    this.device.queue.submit([cmdEncoder.finish()]);

    await tmpStagingBuffer.mapAsync(GPUMapMode.READ);
    plateDataArray.set(new Float32Array(tmpStagingBuffer.getMappedRange()));
    tmpStagingBuffer.unmap();

    // Debug threshold parameters
    console.log("Collision threshold parameters:");
    console.log(`Convergent threshold: ${this.params.convergentThreshold}`);
    console.log(`Divergent threshold: ${this.params.divergentThreshold}`);
    console.log(`Transform threshold: ${this.params.transformThreshold}`);

    // Debug neighbor map data
    console.log("Checking neighbor map data:");
    let nonZeroCount = 0;
    let totalCount = 0;
    for (let i = 0; i < Math.min(100, this.neighborMapData.length); i++) {
      if (this.neighborMapData[i] !== 0) {
        nonZeroCount++;
      }
      totalCount++;
    }
    console.log(
      `Neighbor map: ${nonZeroCount}/${totalCount} non-zero values in sample`
    );

    // Get dimensions
    const { width, height } = this.hexTileBuffer.getTextureSize();
    const totalCells = width * height;

    // Compute the workgroup count
    const workgroupCount = Math.ceil(totalCells / WORKGROUP_SIZE);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // Compute pass
    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.plateCollisionPipeline);
    computePass.setBindGroup(0, this.plateCollisionBindGroup);
    computePass.dispatchWorkgroups(workgroupCount);
    computePass.end();

    // We need to copy the output buffers to update the hex tile data
    // But for now we'll just focus on reading from the collision data buffer
    // which already contains the intensity in the proper format

    // Copy collision data to staging buffer
    commandEncoder.copyBufferToBuffer(
      this.outputBuffer,
      0,
      this.outputBufferStaging,
      0,
      totalCells * 8 * 4
    );

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Read results
    await this.outputBufferStaging.mapAsync(GPUMapMode.READ);
    const results = new Uint32Array(this.outputBufferStaging.getMappedRange());
    this.resultData.set(results);
    this.outputBufferStaging.unmap();

    // Process results to collect boundary information
    const plateBoundaries = [];
    let validCount = 0;

    // Add debug arrays for intensity values
    const debugIntensities = [];
    const debugFallbacks = [];

    for (let i = 0; i < totalCells * 8; i += 8) {
      const validBit = (this.resultData[i] & (1 << 31)) !== 0;
      if (validBit) {
        validCount++;
        const hexIndex = Math.floor(i / 8);
        const collisionType = (this.resultData[i] >> 16) & 0xff;
        const neighborPlateId = this.resultData[i] & 0xffff;

        // Retrieve hex data to get plate ID
        const hexData = this.hexTileBuffer.readTileData(hexIndex);
        const plateId = hexData.tectonicPlate;

        // The collision intensity is stored as a bit-pattern in the next uint32 slot
        // Create a float32 view of the same buffer to read it correctly
        const floatView = new Float32Array(this.resultData.buffer);
        // Calculate proper byte offset: (i+1)*4 bytes / 4 bytes per float = i+1 floats
        const intensityIndex = Math.floor((i + 1) / 4);
        const intensity = floatView[intensityIndex];

        // Collect debug data for the first 10 entries
        if (debugIntensities.length < 10) {
          debugIntensities.push(intensity);
          debugFallbacks.push(hexData.collisionIntensity);
        }

        // Add to boundaries
        plateBoundaries.push({
          hexIndex,
          plateA: plateId,
          plateB: neighborPlateId,
          collisionType: collisionType as CollisionType,
          intensity,
        });
      }
    }

    console.log(
      `Found ${validCount} valid boundaries out of ${totalCells} cells.`
    );

    // Log debug data for intensities
    console.log("Intensity values from HexTileBuffer:", debugIntensities);
    console.log(
      "Fallback intensity values from collision data:",
      debugFallbacks
    );

    // Print a few checks to help debugging
    for (let i = 0; i < Math.min(100, totalCells * 8); i += 8) {
      const validBit = (this.resultData[i] & (1 << 31)) !== 0;
      console.log(
        `Index ${i / 8}: valid=${validBit}, raw value=${this.resultData[
          i
        ].toString(16)}`
      );
    }

    // Return results
    return {
      hexTileBuffer: this.hexTileBuffer,
      plateBoundaries,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.plateDataBuffer.destroy();
    this.plateInfoBuffer.destroy();
    this.outputBuffer.destroy();
    this.outputBufferStaging.destroy();
    this.preDecodedNeighborBuffer.destroy();
  }
}
