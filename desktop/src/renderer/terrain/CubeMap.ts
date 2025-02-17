// Preprocessing script
import * as h3 from "h3-js";
import {
  CubeTexture,
  DataTexture,
  FloatType,
  MathUtils,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from "three";
import { CubicCoordinates } from "../../lib/coordinate-systems/cube-projection/CubicCoordinates";

const RES = 4;
const FACE_SIZE = 1024; // Texture resolution per cube face

export function generateH3CubeMap() {
  const startTime = performance.now();
  console.log("Generating H3 cube map");
  const h3Indices: string[] = [];

  // Create a single Uint8Array to hold all six cube face images.
  const cubeRgba = new Uint8Array(6 * FACE_SIZE * FACE_SIZE * 4);

  // For each cube face
  for (let face = 0; face < 6; face++) {
    for (let y = 0; y < FACE_SIZE; y++) {
      for (let x = 0; x < FACE_SIZE; x++) {
        const cubicCoords = new CubicCoordinates(
          face,
          x / FACE_SIZE,
          y / FACE_SIZE
        );
        const latLong = cubicCoords.toLatLong();
        const h3Index = h3.latLngToCell(latLong.lat, latLong.lon, RES);
        h3Indices.push(h3Index);

        // Convert H3 index to a color (using the last 24 bits in this example)
        const color = h3ToColor(h3Index);

        if (y === 0 && x === 0) {
          console.log("color", color, h3Index);
        }

        // Write the color values into the buffer.
        const offset = (face * FACE_SIZE * FACE_SIZE + y * FACE_SIZE + x) * 4;
        cubeRgba[offset] = Math.floor(color[0] * 255);
        cubeRgba[offset + 1] = Math.floor(color[1] * 255);
        cubeRgba[offset + 2] = Math.floor(color[2] * 255);
        cubeRgba[offset + 3] = 255;
      }
    }
  }

  // Remove duplicates while preserving order
  const uniqueH3Indices = Array.from(new Set(h3Indices));

  // Create six DataTextures from the correct slices of the buffer,
  // one for each cube face.
  const images = [];
  for (let face = 0; face < 6; face++) {
    const offset = face * FACE_SIZE * FACE_SIZE * 4;
    const faceData = cubeRgba.subarray(
      offset,
      offset + FACE_SIZE * FACE_SIZE * 4
    );
    const dataTexture = new DataTexture(
      faceData,
      FACE_SIZE,
      FACE_SIZE,
      RGBAFormat,
      UnsignedByteType
    );
    dataTexture.needsUpdate = true;
    images.push(dataTexture);
  }

  // --- REORDERING THE CUBE FACES USING THE HELPER METHOD ---
  // Use CubicCoordinates.reorderCubeFaces to convert our custom order to Three.js order.
  const reorderedImages = CubicCoordinates.reorderCubeFaces(images);

  console.log("sample color", cubeRgba[0], cubeRgba[1], cubeRgba[2]);

  const cubeTexture = new CubeTexture(reorderedImages);
  cubeTexture.minFilter = NearestFilter;
  cubeTexture.magFilter = NearestFilter;
  cubeTexture.generateMipmaps = false;
  cubeTexture.needsUpdate = true;
  const endTime = performance.now();
  console.log(`H3 cube map generated in ${endTime - startTime}ms`);
  return { cubeTexture, h3Indices: uniqueH3Indices };
}

function h3ToColor(h3Index: string): [number, number, number] {
  // Handle full 64-bit value using BigInt
  const bigVal = BigInt(`0x${h3Index}`);

  // Extract 24 bits using bitwise operations (mix high/low bits)
  const mixed = Number(
    (bigVal ^ (bigVal >> 24n)) & 0xffffffn // XOR high and low bits
  );

  return [
    (mixed >> 16) & 0xff, // Red
    (mixed >> 8) & 0xff, // Green
    mixed & 0xff, // Blue
  ];
}

export function generateH3NeighborTexture(resolution = 4) {
  const res = resolution;
  const allIndices = new Set(
    h3.getRes0Cells().flatMap((index) => h3.cellToChildren(index, res))
  );
  const totalCells = allIndices.size;
  const entriesPerCell = 6;

  // Calculate texture dimensions
  const MAX_TEXTURE_SIZE = 4096;
  const texWidth = Math.min(totalCells * entriesPerCell, MAX_TEXTURE_SIZE);
  const texHeight = Math.ceil((totalCells * entriesPerCell) / texWidth);

  const neighborData = new Uint8Array(texWidth * texHeight * 4); // RGBA

  let index = 0;
  for (const h3Index of allIndices) {
    const neighbors = h3.gridDisk(h3Index, 1);
    for (let i = 0; i < 6; i++) {
      const neighbor = neighbors[i] || "0";
      const numeric = BigInt("0x" + neighbor);

      const offset = index * 4;
      neighborData[offset] = Number((numeric >> 8n) & 0xffn); // R
      neighborData[offset + 1] = Number(numeric & 0xffn); // G
      neighborData[offset + 2] = 0; // B (unused)
      neighborData[offset + 3] = 255; // A
      index++;
    }
  }

  const texture = new DataTexture(
    neighborData,
    texWidth,
    texHeight,
    RGBAFormat,
    UnsignedByteType
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function generateH3PositionTexture(resolution = 4) {
  const res = resolution;
  // Generate all H3 cell nodes of resolution `res` using res0 cells and their children.
  const res0Cells = h3.getRes0Cells();
  const allIndicesSet = new Set<string>();
  res0Cells.forEach((cell) => {
    const children = h3.cellToChildren(cell, res);
    children.forEach((child) => allIndicesSet.add(child));
  });
  let allIndices = Array.from(allIndicesSet);

  // Sort the indices using the same mixed 24-bit value as in the cube map.
  allIndices.sort((a, b) => {
    const aNum = computeMixedH3Id(a);
    const bNum = computeMixedH3Id(b);
    return aNum - bNum;
  });

  const totalCells = allIndices.length;
  // Calculate texture dimensions that stay within WebGL limits
  const MAX_TEXTURE_SIZE = 4096; // Conservative estimate
  const texWidth = Math.min(totalCells, MAX_TEXTURE_SIZE);
  const texHeight = Math.ceil(totalCells / texWidth);

  const positionData = new Float32Array(texWidth * texHeight * 4); // RGBA
  let index = 0;
  for (const h3Index of allIndices) {
    const [lat, lng] = h3.cellToLatLng(h3Index);
    const pos = new Vector3().setFromSphericalCoords(
      1,
      MathUtils.degToRad(90 - lat),
      MathUtils.degToRad(lng)
    );

    const offset = index * 4;
    positionData[offset] = pos.x;
    positionData[offset + 1] = pos.y;
    positionData[offset + 2] = pos.z;
    positionData[offset + 3] = 0.0; // Padding for alignment
    index++;
  }

  // Debug output: log sample positions for verification.
  console.log("Sample positions:");
  for (let i = 0; i < Math.min(5, allIndices.length); i++) {
    const data = positionData.subarray(i * 4, (i + 1) * 4);
    console.log(`H3 ${allIndices[i]} -> Pos:`, data);
  }

  const minH3Id = computeMixedH3Id(allIndices[0]);
  const texture = new DataTexture(
    positionData,
    texWidth,
    texHeight,
    RGBAFormat,
    FloatType
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, minH3Id };
}

function computeMixedH3Id(h3Index: string): number {
  const bigVal = BigInt("0x" + h3Index);
  // Compute the mixed value exactly as in h3ToColor
  const mixed = Number((bigVal ^ (bigVal >> 24n)) & 0xffffffn);
  return mixed;
}
