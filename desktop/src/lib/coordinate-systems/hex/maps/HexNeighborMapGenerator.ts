import { decode, encode } from "@jsquash/webp";
import * as h3 from "h3-js";
import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { HexGrid } from "../HexGrid";

export const INVALID_H3_INDEX_SENTINEL = "FFFFFFFFFFFFFFFF";
export const MAX_UINT_24 = 0xffffff;

type NeighborMapMetadata = {
  resolution: number;
  width: number;
  height: number;
  generatedAt: string;
  version: string;
};

export class HexNeighborMapGenerator {
  private static readonly FILE_MAGIC = 0x4833484e; // 'H3HN' in hex
  private static readonly VERSION = 1;

  public readonly metadata: NeighborMapMetadata;
  private textureData?: Uint8Array;
  public texture?: DataTexture;

  constructor(resolution: number) {
    // Calculate texture dimensions
    const totalCells = HexGrid.allNodes(resolution).length;
    const entriesPerCell = 6;
    const MAX_TEXTURE_SIZE = 4096;
    const width = Math.min(totalCells * entriesPerCell, MAX_TEXTURE_SIZE);
    const height = Math.ceil((totalCells * entriesPerCell) / width);

    this.metadata = {
      resolution,
      width,
      height,
      generatedAt: new Date().toISOString(),
      version: `1.0.${HexNeighborMapGenerator.VERSION}`,
    };
  }

  public generate(): this {
    const startTime = performance.now();
    const { resolution, width, height } = this.metadata;

    this.textureData = new Uint8Array(width * height * 4);
    this.textureData.fill(255);

    const allIndices = HexGrid.allNodes(resolution);
    const neighborSet = new Set<string>();
    let pentagonsCount = 0;
    let index = 0;

    for (const h3Index of allIndices) {
      let neighborh3Indices = h3.gridDisk(h3Index, 1);
      neighborh3Indices = neighborh3Indices.filter(
        (neighborH3Index) => neighborH3Index !== h3Index
      );

      let paddedNeighbors = [];
      if (neighborh3Indices.length === 5) {
        pentagonsCount++;
        paddedNeighbors = neighborh3Indices.concat(INVALID_H3_INDEX_SENTINEL);
      } else {
        paddedNeighbors = neighborh3Indices;
      }

      for (let i = 0; i < 6; i++) {
        const neighborH3 = paddedNeighbors[i];
        let color = HexGrid.encodeNodeIndexToColor(MAX_UINT_24);
        if (neighborH3 !== INVALID_H3_INDEX_SENTINEL) {
          neighborSet.add(neighborH3);
          const neighborIndex = HexGrid.getIndex(neighborH3);
          color = HexGrid.encodeNodeIndexToColor(neighborIndex);
        }
        const offset = index * 4;
        this.textureData[offset] = Math.round(color[0] * 255);
        this.textureData[offset + 1] = Math.round(color[1] * 255);
        this.textureData[offset + 2] = Math.round(color[2] * 255);
        this.textureData[offset + 3] = 255;
        index++;
      }
    }

    if (pentagonsCount !== 12) {
      throw new Error(`Invalid pentagon count: ${pentagonsCount}`);
    }

    if (neighborSet.size !== allIndices.length) {
      throw new Error(
        `Invalid neighbor set size: ${neighborSet.size} !== ${allIndices.length}`
      );
    }

    this.texture = this.createTexture();
    console.log(
      `H3 neighbor map generated in ${performance.now() - startTime}ms`
    );
    return this;
  }

  public async downloadAsWebP(): Promise<void> {
    if (!this.texture) throw new Error("Generate texture first");

    try {
      const { data, width, height } = this.texture.image;
      const imageData = new ImageData(
        new Uint8ClampedArray(data.buffer),
        width,
        height
      );

      const webpData = await encode(imageData, {
        quality: 100,
        lossless: 1,
      });

      const blob = new Blob([webpData], { type: "image/webp" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "h3_neighbor_map.webp";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error saving neighbor map as WebP:", error);
    }
  }

  public static async loadFromWebP(
    url: string,
    resolution: number
  ): Promise<HexNeighborMapGenerator> {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await decode(arrayBuffer);

      const generator = new HexNeighborMapGenerator(resolution);
      generator.metadata.width = decoded.width;
      generator.metadata.height = decoded.height;
      generator.textureData = new Uint8Array(decoded.data.buffer);
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
      UnsignedByteType
    );

    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;

    return texture;
  }
}
