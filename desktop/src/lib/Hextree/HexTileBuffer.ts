import { DataTexture, FloatType, RGBAFormat } from "three";

export type CrustType = "oceanic" | "continental";
export type CrustSubtype =
  | "shield"
  | "platform"
  | "orogen"
  | "basin"
  | "large_igneous"
  | "extended";
export type BiomeType =
  | "tropical_rainforest"
  | "temperate_forest"
  | "boreal_forest"
  | "grassland"
  | "desert"
  | "tundra"
  | "wetland"
  | "aquatic"
  | "alpine"
  | "urban";

export interface HexTileData {
  tectonicPlate: number; // 1-255 (0 reserved for invalid)
  crustType: CrustType;
  crustSubtype: CrustSubtype;
  evapotranspiration: number; // 0-1 normalized
  annualPrecipitation: number; // mm/year (0-5000 normalized)
  annualTemperature: number; // °C (-50 to +50 normalized)
  biome: BiomeType;
  hasHotSpot: boolean;
}

export class HexTileBuffer {
  private device: GPUDevice;
  private texture: GPUTexture;
  private h3Indices: Map<string, number>;
  private textureSize: { width: number; height: number };
  private threejsTexture: DataTexture | null = null;
  private bufferData: Float32Array | null = null;

  constructor(device: GPUDevice, h3Cells: string[]) {
    this.device = device;
    this.h3Indices = new Map(h3Cells.map((h, i) => [h, i]));
    this.textureSize = this.calculateTextureSize(h3Cells.length);
    this.texture = this.createTexture();
  }

  private calculateTextureSize(cellCount: number): {
    width: number;
    height: number;
  } {
    const MAX_DIMENSION = 8192; // Typical GPU texture limit
    const cellsPerRow = Math.min(cellCount, MAX_DIMENSION);
    const rows = Math.ceil(cellCount / cellsPerRow);
    return { width: cellsPerRow, height: rows };
  }

  private createTexture(): GPUTexture {
    return this.device.createTexture({
      size: [this.textureSize.width, this.textureSize.height],
      format: "rgba32float", // High precision for environmental data
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
      label: "HexTileBuffer",
    });
  }

  public async updateTileData(data: Map<string, HexTileData>): Promise<void> {
    const bufferData = new Float32Array(
      this.textureSize.width * this.textureSize.height * 4
    );

    for (const [h3, tileData] of data.entries()) {
      const index = this.h3Indices.get(h3);
      if (index === undefined) continue;

      const {
        tectonicPlate,
        crustType,
        crustSubtype,
        evapotranspiration,
        biome,
        hasHotSpot,
      } = tileData;

      // Encode data into 4-component float vector
      const baseIndex = index * 4;
      bufferData[baseIndex] = tectonicPlate;
      bufferData[baseIndex + 1] = this.encodeCrustData(crustType, crustSubtype);
      bufferData[baseIndex + 2] = evapotranspiration;
      bufferData[baseIndex + 3] = this.encodeBiomeData(biome, hasHotSpot);
    }

    this.bufferData = bufferData;

    if (this.threejsTexture) {
      this.threejsTexture.image.data = bufferData;
      this.threejsTexture.needsUpdate = true;
    }

    await this.device.queue.writeTexture(
      { texture: this.texture },
      bufferData,
      { bytesPerRow: this.textureSize.width * 4 * 4 }, // 4 components * 4 bytes per float
      [this.textureSize.width, this.textureSize.height]
    );
  }

  private encodeCrustData(type: CrustType, subtype: CrustSubtype): number {
    const typeCode = type === "oceanic" ? 0 : 1;
    const subtypeCodes: Record<CrustSubtype, number> = {
      shield: 0,
      platform: 1,
      orogen: 2,
      basin: 3,
      large_igneous: 4,
      extended: 5,
    };
    return typeCode * 10 + subtypeCodes[subtype];
  }

  private encodeBiomeData(biome: BiomeType, hotSpot: boolean): number {
    const biomeCodes: Record<BiomeType, number> = {
      tropical_rainforest: 0,
      temperate_forest: 1,
      boreal_forest: 2,
      grassland: 3,
      desert: 4,
      tundra: 5,
      wetland: 6,
      aquatic: 7,
      alpine: 8,
      urban: 9,
    };
    return (biomeCodes[biome] << 1) | (hotSpot ? 1 : 0);
  }

  public getTexture(): GPUTexture {
    return this.texture;
  }

  public getTextureSize(): { width: number; height: number } {
    return this.textureSize;
  }

  public destroy() {
    this.texture.destroy();
  }

  public getThreejsTexture(): DataTexture {
    if (!this.threejsTexture) {
      if (!this.bufferData) {
        throw new Error(
          "Must call updateTileData before getting Three.js texture"
        );
      }

      this.threejsTexture = new DataTexture(
        this.bufferData,
        this.textureSize.width,
        this.textureSize.height,
        RGBAFormat,
        FloatType
      );
      this.threejsTexture.needsUpdate = true;
    }
    return this.threejsTexture;
  }
}
