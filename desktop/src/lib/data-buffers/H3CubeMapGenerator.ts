import { decode, encode } from "@jsquash/webp";
import * as h3 from "h3-js";
import {
  CubeTexture,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { CubicCoordinates } from "../coordinate-systems/cube-projection/CubicCoordinates";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";

type H3CubeMapMetadata = {
  resolution: number;
  faceSize: number;
  generatedAt: string;
  version: string;
};

export class H3CubeMapGenerator {
  private static readonly FILE_MAGIC = 0x4833434d; // 'H3CM' in hex
  private static readonly VERSION = 1;

  public readonly metadata: H3CubeMapMetadata;
  private cubeRgba?: Uint8Array;
  public cubeTexture?: CubeTexture;

  constructor(resolution: number, faceSize: number) {
    this.metadata = {
      resolution,
      faceSize,
      generatedAt: new Date().toISOString(),
      version: `1.0.${H3CubeMapGenerator.VERSION}`,
    };
    this.cubeRgba = new Uint8Array(6 * faceSize * faceSize * 4);
    this.cubeRgba.fill(0);
    this.cubeTexture = this.createCubeTexture();
  }

  public generate(): this {
    const startTime = performance.now();
    const { resolution, faceSize } = this.metadata;

    // Validate resolution first
    const allIndices = HexGrid.allNodes(resolution);
    if (allIndices.length > 16777215) {
      throw new Error(
        `H3 resolution ${resolution} produces too many indices (${allIndices.length}) for 24-bit color encoding`
      );
    }

    this.cubeRgba = new Uint8Array(6 * faceSize * faceSize * 4);

    for (let face = 0; face < 6; face++) {
      for (let x = 0; x < faceSize; x++) {
        for (let y = 0; y < faceSize; y++) {
          const cubicCoords = new CubicCoordinates(
            face,
            (x + 0.5) / faceSize,
            (y + 0.5) / faceSize
          );
          const latLong = cubicCoords.toLatLong();
          const h3Index = h3.latLngToCell(latLong.lat, latLong.lon, resolution);
          const incrementalIndex = HexGrid.getIndex(h3Index);
          const color = HexGrid.encodeNodeIndexToColor(incrementalIndex);

          const offset = (face * faceSize * faceSize + y * faceSize + x) * 4;
          this.cubeRgba[offset] = Math.round(color[0] * 255);
          this.cubeRgba[offset + 1] = Math.round(color[1] * 255);
          this.cubeRgba[offset + 2] = Math.round(color[2] * 255);
          this.cubeRgba[offset + 3] = 255;
        }
      }
    }

    this.cubeTexture = this.createCubeTexture();
    console.log(`H3 cube map generated in ${performance.now() - startTime}ms`);
    return this;
  }

  public serialize(): ArrayBuffer {
    if (!this.cubeRgba) throw new Error("Generate cube map first");

    const headerSize = 24; // 24 bytes for header
    const buffer = new ArrayBuffer(headerSize + this.cubeRgba.byteLength);
    const view = new DataView(buffer);

    // Header
    view.setUint32(0, H3CubeMapGenerator.FILE_MAGIC); // 4 bytes
    view.setUint8(4, H3CubeMapGenerator.VERSION); // 1 byte
    view.setUint8(5, this.metadata.resolution); // 1 byte
    view.setUint16(6, this.metadata.faceSize); // 2 bytes
    // Remaining 16 bytes reserved for future use

    // Add pixel data
    const dataView = new Uint8Array(buffer, headerSize);
    dataView.set(this.cubeRgba);

    return buffer;
  }

  public downloadAsBinary(filename = "h3-cubemap.bin"): void {
    const buffer = this.serialize();
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

  public async downloadAsWebP(): Promise<void> {
    if (!this.cubeTexture) throw new Error("Generate cube map first");

    try {
      await Promise.all(
        this.cubeTexture.images.map(async (dataTexture, index) => {
          const image = dataTexture.image;
          if (!image) {
            console.error(`No image data for cube face ${index}`);
            return;
          }

          const { data, width, height } = image;

          try {
            const imageData = new ImageData(
              new Uint8ClampedArray(data),
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
            link.download = `h3_cubemap_face_${index}.webp`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          } catch (error) {
            console.error(`Error saving face ${index} as WebP:`, error);
          }
        })
      );
    } catch (error) {
      console.error("Failed to initialize WebP encoder:", error);
    }
  }

  public static deserialize(buffer: ArrayBuffer): H3CubeMapGenerator {
    const view = new DataView(buffer);

    // Validate magic number
    if (view.getUint32(0) !== this.FILE_MAGIC) {
      throw new Error("Invalid file format");
    }

    const version = view.getUint8(4);
    if (version > this.VERSION) {
      throw new Error(`Unsupported file version: ${version}`);
    }

    const resolution = view.getUint8(5);
    const faceSize = view.getUint16(6);

    const instance = new H3CubeMapGenerator(resolution, faceSize);
    const headerSize = 24;
    instance.cubeRgba = new Uint8Array(buffer.slice(headerSize));
    instance.cubeTexture = instance.createCubeTexture();

    return instance;
  }

  public static async loadFromFile(file: File): Promise<H3CubeMapGenerator> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          try {
            resolve(this.deserialize(reader.result));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error("Failed to read file as ArrayBuffer"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  public static async loadFromWebPFiles(
    urls: string[]
  ): Promise<H3CubeMapGenerator> {
    try {
      const faceBuffers = await Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const decoded = await decode(arrayBuffer);
          return {
            data: new Uint8Array(decoded.data.buffer),
            width: decoded.width,
            height: decoded.height,
          };
        })
      );

      const faceSize = faceBuffers[0].width;
      const cubeRgba = new Uint8Array(6 * faceSize * faceSize * 4);

      faceBuffers.forEach(({ data }, face) => {
        const offset = face * faceSize * faceSize * 4;
        cubeRgba.set(data, offset);
      });

      const generator = new H3CubeMapGenerator(/* resolution */ 0, faceSize);
      generator.cubeRgba = cubeRgba;
      generator.cubeTexture = generator.createCubeTexture(false);
      return generator;
    } catch (error) {
      throw error;
    }
  }

  public async loadFromWebPFiles(urls: string[]): Promise<H3CubeMapGenerator> {
    try {
      const faceBuffers = await Promise.all(
        urls.map(async (url) => {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const decoded = await decode(arrayBuffer);
          return {
            data: new Uint8Array(decoded.data.buffer),
            width: decoded.width,
            height: decoded.height,
          };
        })
      );

      const faceSize = faceBuffers[0].width;

      faceBuffers.forEach(({ data }, face) => {
        const offset = face * faceSize * faceSize * 4;
        this.cubeRgba.set(data, offset);
      });

      this.cubeTexture = this.createCubeTexture(false);
      return this;
    } catch (error) {
      throw error;
    }
  }

  private createCubeTexture(reorder = true): CubeTexture {
    if (!this.cubeRgba) throw new Error("Generate cube map first");

    const { faceSize } = this.metadata;
    let images = [];

    for (let face = 0; face < 6; face++) {
      const offset = face * faceSize * faceSize * 4;
      const faceData = this.cubeRgba.subarray(
        offset,
        offset + faceSize * faceSize * 4
      );
      const dataTexture = new DataTexture(
        faceData,
        faceSize,
        faceSize,
        RGBAFormat,
        UnsignedByteType
      );
      dataTexture.minFilter = NearestFilter;
      dataTexture.magFilter = NearestFilter;
      dataTexture.needsUpdate = true;
      images.push(dataTexture);
    }

    // If you load them in the same order they are generated in the cube map, the faces will be misaligned.
    if (reorder) {
      const reorderedImages = CubicCoordinates.reorderCubeFaces(images);
      images = reorderedImages;
    }

    const cubeTexture = new CubeTexture(images);
    cubeTexture.minFilter = NearestFilter;
    cubeTexture.magFilter = NearestFilter;
    cubeTexture.generateMipmaps = false;
    cubeTexture.needsUpdate = true;

    return cubeTexture;
  }
}
