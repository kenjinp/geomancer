import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  RGBAIntegerFormat,
  UnsignedIntType,
} from "three";

import { HexGrid } from "../coordinate-systems/hex/HexGrid";

export type CrustType = "oceanic" | "continental";
export type CrustSubtype =
  | "undefined"
  | "shield"
  | "platform"
  | "orogen"
  | "basin"
  | "large_igneous"
  | "extended";
export type BiomeType =
  | "undefined"
  | "tundra"
  | "woodland_shrublands"
  | "boreal_forest"
  | "temperate_seasonal_forest"
  | "temperate_rainforest"
  | "tropical_rainforest"
  | "temperate_grassland"
  | "tropical_seasonal_forest_savannah"
  | "subtropical_desert";

export interface HexTileData {
  tectonicPlate: number; // 1-255 (0 reserved for invalid)
  crustType: CrustType;
  crustSubtype: CrustSubtype;
  evapotranspiration: number; // 0-1 normalized
  annualPrecipitation: number; // mm/year (0-5000 normalized)
  annualTemperature: number; // °C (-50 to +50 normalized)
  elevation: number; // -1 to 1 normalized
  biome: BiomeType;
  hasHotSpot: boolean;
}

export class HexTileBuffer {
  private textureSize: { width: number; height: number };

  // Integer data (tectonic plate, crust types, biome, hotspot)
  private intBufferData: Uint32Array;
  private intTexture: DataTexture;

  // Float data (evapotranspiration, precipitation, temperature)
  private floatBufferData: Float32Array;
  private floatTexture: DataTexture;

  constructor(public readonly resolution: number) {
    const h3Cells = HexGrid.allNodes(this.resolution);
    this.textureSize = this.calculateTextureSize(h3Cells.length);

    const totalPixels = this.textureSize.width * this.textureSize.height;

    // Create integer buffer and texture.
    // The shader samples this with `usampler2D`, so the texture must be
    // uploaded with a sized integer internal format (RGBA32UI). Three.js
    // can normally deduce this from `RGBAIntegerFormat + UnsignedIntType`,
    // but on some drivers (notably packaged Electron on Windows) the
    // auto-deduced format can mismatch the sampler type and trigger
    // `GL_INVALID_OPERATION: Mismatch between texture format and sampler
    // type`. Setting `internalFormat` and the filtering/mipmap settings
    // explicitly avoids that. Linear filtering and mipmaps are not allowed
    // for integer textures, so they must be NearestFilter / disabled.
    this.intBufferData = new Uint32Array(totalPixels * 4);
    this.intBufferData.fill(0);
    this.intTexture = new DataTexture(
      this.intBufferData,
      this.textureSize.width,
      this.textureSize.height,
      RGBAIntegerFormat,
      UnsignedIntType,
    );
    this.intTexture.internalFormat = "RGBA32UI";
    this.intTexture.minFilter = NearestFilter;
    this.intTexture.magFilter = NearestFilter;
    this.intTexture.generateMipmaps = false;
    this.intTexture.needsUpdate = true;

    // Create float buffer and texture
    this.floatBufferData = new Float32Array(totalPixels * 4);
    this.floatBufferData.fill(0);
    this.floatTexture = new DataTexture(
      this.floatBufferData,
      this.textureSize.width,
      this.textureSize.height,
      RGBAFormat,
      FloatType,
    );
    this.floatTexture.internalFormat = "RGBA32F";
    this.floatTexture.minFilter = NearestFilter;
    this.floatTexture.magFilter = NearestFilter;
    this.floatTexture.generateMipmaps = false;
    this.floatTexture.needsUpdate = true;
  }

  private calculateTextureSize(cellCount: number): {
    width: number;
    height: number;
  } {
    const MAX_DIMENSION = 8192;
    const cellsPerRow = Math.min(cellCount, MAX_DIMENSION);
    const rows = Math.ceil(cellCount / cellsPerRow);
    return { width: cellsPerRow, height: rows };
  }

  /**
   * Update a single tile's data in both textures
   */
  public updateTileData(tileIndex: number, tileData: HexTileData): void {
    const {
      tectonicPlate,
      crustType,
      crustSubtype,
      evapotranspiration,
      annualPrecipitation,
      annualTemperature,
      elevation,
      biome,
      hasHotSpot,
    } = tileData;

    // validate values
    if (tectonicPlate < 0 || tectonicPlate > 255) {
      throw new Error(`Tectonic plate must be between 0 and 255, got ${tectonicPlate}`);
    }
    if (annualPrecipitation < 0 || annualPrecipitation > 5000) {
      throw new Error(
        `Annual precipitation must be between 0 and 5000, got ${annualPrecipitation}`,
      );
    }
    if (annualTemperature < -50 || annualTemperature > 50) {
      throw new Error(`Annual temperature must be between -50 and 50, got ${annualTemperature}`);
    }
    if (evapotranspiration < 0 || evapotranspiration > 1) {
      throw new Error(`Evapotranspiration must be between 0 and 1, got ${evapotranspiration}`);
    }
    if (elevation < -1 || elevation > 1) {
      throw new Error(`Elevation must be between -1 and 1, got ${elevation}`);
    }

    // Update integer texture data
    const intBaseIndex = tileIndex * 4;
    this.intBufferData[intBaseIndex] = tectonicPlate;
    this.intBufferData[intBaseIndex + 1] = this.encodeCrustData(crustType, crustSubtype);
    this.intBufferData[intBaseIndex + 2] = this.encodeBiomeData(biome, hasHotSpot);
    this.intBufferData[intBaseIndex + 3] = 0; // Reserved for future use

    // Update float texture data
    const floatBaseIndex = tileIndex * 4;
    this.floatBufferData[floatBaseIndex] = evapotranspiration;
    this.floatBufferData[floatBaseIndex + 1] = this.normalizeValue(annualPrecipitation, 0, 5000);
    this.floatBufferData[floatBaseIndex + 2] = this.normalizeValue(annualTemperature, -50, 50);
    this.floatBufferData[floatBaseIndex + 3] = elevation; // Store elevation in the previously reserved slot

    this.intTexture.needsUpdate = true;
    this.floatTexture.needsUpdate = true;
  }

  /**
   * Helper method to update multiple tiles at once
   */
  public updateTiles(data: Map<string, HexTileData>): void {
    for (const [h3, tileData] of data.entries()) {
      const index = HexGrid.getIndex(h3);
      if (index === undefined) continue;
      this.updateTileData(index, tileData);
    }
  }

  public readTileData(tileIndex: number): HexTileData {
    const intBaseIndex = tileIndex * 4;
    const floatBaseIndex = tileIndex * 4;

    return {
      tectonicPlate: this.intBufferData[intBaseIndex],
      crustType: this.decodeCrustData(this.intBufferData[intBaseIndex + 1]),
      crustSubtype: this.decodeCrustSubtype(this.intBufferData[intBaseIndex + 1]),
      evapotranspiration: this.floatBufferData[floatBaseIndex],
      annualPrecipitation: this.floatBufferData[floatBaseIndex + 1],
      annualTemperature: this.floatBufferData[floatBaseIndex + 2],
      elevation: this.floatBufferData[floatBaseIndex + 3],
      biome: this.decodeBiomeData(this.intBufferData[intBaseIndex + 2]),
      hasHotSpot: this.intBufferData[intBaseIndex + 3] === 1,
    };
  }

  private decodeBiomeData(data: number): BiomeType {
    return data === 0 ? "undefined" : "tundra";
  }

  private decodeCrustData(data: number): CrustType {
    return data === 0 ? "oceanic" : "continental";
  }

  private decodeCrustSubtype(data: number): CrustSubtype {
    return data === 0 ? "undefined" : "shield";
  }

  private normalizeValue(value: number, min: number, max: number): number {
    return (value - min) / (max - min);
  }

  private encodeCrustData(type: CrustType, subtype: CrustSubtype): number {
    const typeCode = type === "oceanic" ? 0 : 1;
    const subtypeCodes: Record<CrustSubtype, number> = {
      undefined: 0,
      shield: 1,
      platform: 2,
      orogen: 3,
      basin: 4,
      large_igneous: 5,
      extended: 6,
    };
    return typeCode * 10 + subtypeCodes[subtype];
  }

  private encodeBiomeData(biome: BiomeType, hotSpot: boolean): number {
    const biomeCodes: Record<BiomeType, number> = {
      undefined: 0,
      // whittaker biome codes
      tundra: 1,
      woodland_shrublands: 2,
      boreal_forest: 3,
      temperate_seasonal_forest: 4,
      temperate_rainforest: 5,
      tropical_rainforest: 6,
      temperate_grassland: 7,
      tropical_seasonal_forest_savannah: 8,
      subtropical_desert: 9,
    };
    return (biomeCodes[biome] << 1) | (hotSpot ? 1 : 0);
  }

  public getTextureSize(): { width: number; height: number } {
    return this.textureSize;
  }

  public getIntegerTexture(): DataTexture {
    return this.intTexture;
  }

  public getFloatTexture(): DataTexture {
    return this.floatTexture;
  }

  public destroy() {
    this.intTexture.dispose();
    this.floatTexture.dispose();
  }

  public copy(hexTileBuffer: HexTileBuffer) {
    this.intBufferData.set(hexTileBuffer.intBufferData);
    this.floatBufferData.set(hexTileBuffer.floatBufferData);
    this.intTexture.needsUpdate = true;
    this.floatTexture.needsUpdate = true;
  }

  // // Add iterator implementation
  [Symbol.iterator] = function* () {
    const h3Cells = HexGrid.allNodes(this.resolution);
    for (let i = 0; i < h3Cells.length; i++) {
      yield this.readTileData(i);
    }
  };
}
