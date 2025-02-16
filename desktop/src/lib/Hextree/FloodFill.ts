import * as h3 from "h3-js";
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
  private h3Indices: Map<string, number>;
  private bindGroups: GPUBindGroup[] = [];
  private seedBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private neighborTexture: GPUTexture;

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

    // Add uniform buffer for pass index
    this.uniformBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create neighbor texture for static data
    this.neighborTexture = this.device.createTexture({
      size: { width: 6, height: this.config.maxCells, depthOrArrayLayers: 1 },
      format: "r32uint",
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
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

  public async runComputePasses(): Promise<FloodFillResult> {
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

  public async precomputeNeighborsAsTexture(h3Cells: string[]) {
    this.h3Indices = new Map(h3Cells.map((h, i) => [h, i]));

    const neighborData = new Uint32Array(h3Cells.length * 6);
    neighborData.fill(0xffffffff);

    for (let i = 0, cellCount = h3Cells.length; i < cellCount; i++) {
      const cell = h3Cells[i];
      const candidates = h3.gridDisk(cell, 1);
      const baseIndex = i * 6;
      let validCount = 0;

      // Start from 1 to skip the center cell
      for (
        let j = 1, candCount = candidates.length;
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

    // Upload neighborData to the texture.
    this.device.queue.writeTexture(
      { texture: this.neighborTexture },
      neighborData,
      {
        // bytesPerRow must be a multiple of 256 as per WebGPU spec. Depending on the
        // total size, you might need to pad your neighborData accordingly.
        bytesPerRow: 6 * 4,
      },
      { width: 6, height: h3Cells.length, depthOrArrayLayers: 1 }
    );
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

  public async exportNeighborTexture(
    h3Cells: string[],
    options?: { asImage?: boolean; square?: boolean }
  ): Promise<void> {
    let textureWidth: number, textureHeight: number, neighborData: Uint32Array;
    const cellNeighborCount = 6;

    if (options?.square) {
      // --- Create a Square Texture ---
      // Total required texels = number of cells × 6 (texels per cell)
      const totalCells = h3Cells.length;
      const requiredTexels = totalCells * cellNeighborCount;
      // Compute the minimal square side in texels...
      const side = Math.ceil(Math.sqrt(requiredTexels));
      // Ensure the side is a multiple of 6 so that each cell's data is kept together.
      const textureSize =
        Math.ceil(side / cellNeighborCount) * cellNeighborCount;
      textureWidth = textureSize;
      textureHeight = textureSize;
      // In a square layout, the number of cells per row is:
      const cellsPerRow = textureWidth / cellNeighborCount;

      // Allocate neighbor data for the entire square texture.
      const totalTexelsSquare = textureWidth * textureHeight;
      neighborData = new Uint32Array(totalTexelsSquare);
      neighborData.fill(0xffffffff);

      // Build a mapping from H3 cell to its index.
      this.h3Indices = new Map(h3Cells.map((h, i) => [h, i]));

      // Fill each cell's 6-texel slot in the packed square texture.
      for (let i = 0; i < totalCells; i++) {
        const cell = h3Cells[i];
        const cellRow = Math.floor(i / cellsPerRow);
        const cellCol = i % cellsPerRow;
        const baseIndex = cellRow * textureWidth + cellCol * cellNeighborCount;

        // Get the 1-disk neighbors (skip the first element which is the cell itself).
        const candidates = h3.gridDisk(cell, 1);
        let validCount = 0;
        for (
          let j = 1;
          j < candidates.length && validCount < cellNeighborCount;
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
    } else {
      // --- Use Previous Packing Approach (Non-Square) ---
      // Pack the cells into rows such that texture width = cellsPerRow * 6,
      // while keeping each dimension below the maximum (8192).
      const MAX_TEXTURE_DIMENSION = 8192;
      const cellsPerRow = Math.floor(MAX_TEXTURE_DIMENSION / cellNeighborCount);
      textureWidth = cellsPerRow * cellNeighborCount;
      textureHeight = Math.ceil(h3Cells.length / cellsPerRow);
      const totalTexelsPacked = textureWidth * textureHeight;
      neighborData = new Uint32Array(totalTexelsPacked);
      neighborData.fill(0xffffffff);

      this.h3Indices = new Map(h3Cells.map((h, i) => [h, i]));

      for (let i = 0; i < h3Cells.length; i++) {
        const cell = h3Cells[i];
        const cellRow = Math.floor(i / cellsPerRow);
        const cellCol = i % cellsPerRow;
        const baseIndex = cellRow * textureWidth + cellCol * cellNeighborCount;
        const candidates = h3.gridDisk(cell, 1);
        let validCount = 0;
        for (
          let j = 1;
          j < candidates.length && validCount < cellNeighborCount;
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
    }

    // --- Create the Texture and Upload the Data ---
    // WebGPU requires that bytesPerRow (width in bytes) be a multiple of 256.
    const bytesPerPixel = 4; // r32uint = 4 bytes per texel
    const unpaddedBytesPerRow = textureWidth * bytesPerPixel;
    const paddedBytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;

    // Create a GPU texture with COPY_SRC usage (needed for readback) and TEXTURE_BINDING.
    this.neighborTexture = this.device.createTexture({
      size: {
        width: textureWidth,
        height: textureHeight,
        depthOrArrayLayers: 1,
      },
      format: "r32uint",
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.TEXTURE_BINDING,
    });

    // Copy our tightly packed neighborData into an upload buffer with row padding.
    const uploadBuffer = new Uint8Array(paddedBytesPerRow * textureHeight);
    const neighborDataView = new Uint8Array(neighborData.buffer);
    for (let row = 0; row < textureHeight; row++) {
      const srcOffset = row * unpaddedBytesPerRow;
      const dstOffset = row * paddedBytesPerRow;
      uploadBuffer.set(
        neighborDataView.subarray(srcOffset, srcOffset + unpaddedBytesPerRow),
        dstOffset
      );
    }

    this.device.queue.writeTexture(
      { texture: this.neighborTexture },
      uploadBuffer,
      { bytesPerRow: paddedBytesPerRow, rowsPerImage: textureHeight },
      { width: textureWidth, height: textureHeight, depthOrArrayLayers: 1 }
    );

    // --- Copy the Texture to a Buffer for Download ---
    const bufferSize = paddedBytesPerRow * textureHeight;
    const downloadBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      {
        texture: this.neighborTexture,
        mipLevel: 0,
        origin: { x: 0, y: 0, z: 0 },
      },
      {
        buffer: downloadBuffer,
        offset: 0,
        bytesPerRow: paddedBytesPerRow,
        rowsPerImage: textureHeight,
      },
      { width: textureWidth, height: textureHeight, depthOrArrayLayers: 1 }
    );
    this.device.queue.submit([commandEncoder.finish()]);

    await downloadBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = downloadBuffer.getMappedRange();
    const paddedData = new Uint8Array(arrayBuffer);

    // Remove the per-row padding.
    const rawData = new Uint8Array(unpaddedBytesPerRow * textureHeight);
    for (let row = 0; row < textureHeight; row++) {
      const srcOffset = row * paddedBytesPerRow;
      const dstOffset = row * unpaddedBytesPerRow;
      rawData.set(
        paddedData.subarray(srcOffset, srcOffset + unpaddedBytesPerRow),
        dstOffset
      );
    }
    downloadBuffer.unmap();

    // --- Output Option: Image vs. Binary Download ---
    if (options?.asImage) {
      // Convert the rawData to an image using an HTML canvas.
      const canvas = document.createElement("canvas");
      canvas.width = textureWidth;
      canvas.height = textureHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to obtain the 2D canvas context");
      const imageData = ctx.createImageData(textureWidth, textureHeight);
      const data = imageData.data; // Uint8ClampedArray

      const dataView = new DataView(rawData.buffer);
      for (let i = 0; i < textureWidth * textureHeight; i++) {
        const value = dataView.getUint32(i * 4, true);
        let r: number, g: number, b: number;
        if (value === 0xffffffff) {
          r = g = b = 0;
        } else {
          r = (value >> 16) & 0xff;
          g = (value >> 8) & 0xff;
          b = value & 0xff;
        }
        data[i * 4 + 0] = r;
        data[i * 4 + 1] = g;
        data[i * 4 + 2] = b;
        data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);

      // Create a data URL from the canvas (PNG) and trigger a download.
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `neighborTexture_${textureWidth}x${textureHeight}.png`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } else {
      // Download the raw texture data as a binary file.
      const blob = new Blob([rawData.buffer], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `neighborTexture_${textureWidth}x${textureHeight}.bin`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    }
  }

  public async exportFloodFillResultsAsSquareImage(): Promise<void> {
    // Determine the total number of cells from the configuration.
    // (Assumes 'filledBuffer' has an entry for each cell.)
    const totalCells = this.config.maxCells;
    const totalBytes = totalCells * 4; // 4 bytes per 32-bit value

    // Create a readback buffer for the filledBuffer.
    const readbackBuffer = this.device.createBuffer({
      size: totalBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Copy data from the filledBuffer to the readbackBuffer.
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.filledBuffer, // source buffer
      0, // source offset
      readbackBuffer, // destination buffer
      0, // destination offset
      totalBytes
    );
    this.device.queue.submit([encoder.finish()]);

    // Map the buffer for reading.
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const filledArray = new Uint32Array(readbackBuffer.getMappedRange());
    readbackBuffer.unmap();

    // Determine the dimensions of a square image.
    // This will create an image with (squareSize x squareSize) pixels.
    const squareSize = Math.ceil(Math.sqrt(totalCells));

    // Create an HTML canvas with the computed square dimensions.
    const canvas = document.createElement("canvas");
    canvas.width = squareSize;
    canvas.height = squareSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to get 2D canvas context");

    // Create an ImageData object to hold our pixel data.
    const imageData = ctx.createImageData(squareSize, squareSize);
    const data = imageData.data; // Uint8ClampedArray

    // Populate the image data.
    // Each cell in filledArray corresponds to one pixel.
    // For cells beyond totalCells (if squareSize^2 > totalCells), set them to black.
    for (let i = 0; i < squareSize * squareSize; i++) {
      const value = i < filledArray.length ? filledArray[i] : 0;
      let r = 0,
        g = 0,
        b = 0;
      if (value === 0) {
        // Not filled; choose black (or another background color).
        r = 0;
        g = 0;
        b = 0;
      } else {
        // For filled cells, generate a color based on the value.
        // You can tweak these multipliers to get different color distributions.
        r = (value * 37) % 256;
        g = (value * 73) % 256;
        b = (value * 109) % 256;
      }
      data[i * 4 + 0] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255; // fully opaque
    }

    // Put the image data onto the canvas.
    ctx.putImageData(imageData, 0, 0);

    // Create a PNG data URL from the canvas and trigger a download.
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `floodFillResults_${squareSize}x${squareSize}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
