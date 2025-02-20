import { DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";
import { HexGrid } from "../HexGrid";

type PositionMapMetadata = {
  resolution: number;
  width: number;
  height: number;
  generatedAt: string;
  version: string;
};

export class HexPositionMapGenerator {
  private static readonly FILE_MAGIC = 0x48335058; // 'H3PX' in hex
  private static readonly VERSION = 1;

  public readonly metadata: PositionMapMetadata;
  private textureData?: Float32Array;
  public texture?: DataTexture;

  constructor(resolution: number) {
    const totalCells = HexGrid.allNodes(resolution).length;
    const MAX_TEXTURE_SIZE = 4096;
    const width = Math.min(totalCells, MAX_TEXTURE_SIZE);
    const height = Math.ceil(totalCells / width) || 1;

    this.metadata = {
      resolution,
      width,
      height,
      generatedAt: new Date().toISOString(),
      version: `1.0.${HexPositionMapGenerator.VERSION}`,
    };
  }

  public generate(): this {
    const { resolution, width, height } = this.metadata;
    const allIndices = HexGrid.allNodes(resolution);

    this.textureData = new Float32Array(width * height * 4);
    this.textureData.fill(-1);

    for (let i = 0; i < allIndices.length; i++) {
      const h3Index = allIndices[i];
      if (i !== HexGrid.getIndex(h3Index)) {
        throw new Error(`Index mismatch, ${i}, ${h3Index}`);
      }

      const pos = HexGrid.getPositionFromH3(h3Index);
      const offset = i * 4;
      this.textureData[offset] = pos.x;
      this.textureData[offset + 1] = pos.y;
      this.textureData[offset + 2] = pos.z;
      this.textureData[offset + 3] = 0.0;
    }

    this.texture = this.createTexture();
    return this;
  }

  public async downloadBinary(filename = "h3_positions.bin"): Promise<void> {
    if (!this.textureData) throw new Error("Generate texture first");

    const headerSize = 16; // Magic(4) + Version(4) + Width(4) + Height(4)
    const buffer = new ArrayBuffer(headerSize + this.textureData.byteLength);
    const view = new DataView(buffer);

    // Write header
    view.setUint32(0, HexPositionMapGenerator.FILE_MAGIC);
    view.setUint32(4, HexPositionMapGenerator.VERSION);
    view.setUint32(8, this.metadata.width);
    view.setUint32(12, this.metadata.height);

    // Write float data
    new Float32Array(buffer, headerSize).set(this.textureData);

    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  public static async loadFromBinary(
    url: string,
    resolution: number
  ): Promise<HexPositionMapGenerator> {
    try {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      const view = new DataView(buffer);

      // Validate magic number
      if (view.getUint32(0) !== this.FILE_MAGIC) {
        throw new Error("Invalid position map file format");
      }

      // Read header
      const version = view.getUint32(4);
      const width = view.getUint32(8);
      const height = view.getUint32(12);

      if (version !== this.VERSION) {
        throw new Error(`Unsupported version: ${version}`);
      }

      const generator = new HexPositionMapGenerator(resolution);
      generator.metadata.width = width;
      generator.metadata.height = height;

      // Read float data
      const headerSize = 16;
      generator.textureData = new Float32Array(buffer.slice(headerSize));
      generator.texture = generator.createTexture();

      return generator;
    } catch (error) {
      throw error;
    }
  }

  private createTexture(): DataTexture {
    if (!this.textureData) throw new Error("Generate texture data first");

    const { width, height } = this.metadata;
    const texture = new DataTexture(
      this.textureData,
      width,
      height,
      RGBAFormat,
      FloatType
    );

    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    return texture;
  }
}
