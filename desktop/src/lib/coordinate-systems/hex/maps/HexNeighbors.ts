import * as h3 from "h3-js";
import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  TextureLoader,
  UnsignedByteType,
} from "three";
import { HexGrid } from "../HexGrid";

export const INVALID_H3_INDEX_SENTINEL = "FFFFFFFFFFFFFFFF";
export const MAX_UINT_24 = 0xffffff;
export function generateH3NeighborTexture(resolution = 4) {
  const allIndices = HexGrid.allNodes(resolution);
  const totalCells = allIndices.length;
  const entriesPerCell = 6;

  // Calculate texture dimensions
  const MAX_TEXTURE_SIZE = 4096;
  const texWidth = Math.min(totalCells * entriesPerCell, MAX_TEXTURE_SIZE);
  const texHeight = Math.ceil((totalCells * entriesPerCell) / texWidth);

  const neighborData = new Uint8Array(texWidth * texHeight * 4); // RGBA
  neighborData.fill(-1);

  const neighborSet = new Set<string>();

  let index = 0;
  let pentagonsCount = 0;
  for (const h3Index of allIndices) {
    let neighborh3Indices = h3.gridDisk(h3Index, 1);

    // remove the center cell from the neighbors list
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
      neighborData[offset] = Math.round(color[0] * 255);
      neighborData[offset + 1] = Math.round(color[1] * 255);
      neighborData[offset + 2] = Math.round(color[2] * 255);
      neighborData[offset + 3] = 255; // A
      index++;
    }
  }

  if (pentagonsCount !== 12) {
    throw new Error(`Invalid pentagon count: ${pentagonsCount}`);
  }

  if (neighborSet.size !== totalCells) {
    throw new Error(
      `Invalid neighbor set size: ${neighborSet.size} !== ${totalCells}`
    );
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

  // Add validation before texture generation
  allIndices.forEach((h3Index, index) => {
    if (HexGrid.getIndex(h3Index) !== index) {
      throw new Error(`Index mismatch at ${index}: ${h3Index}`);
    }
  });

  // Add edge padding to prevent texture filtering artifacts
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;

  return texture;
}

export function downloadH3NeighborTexture(texture: DataTexture) {
  const image = texture.image;
  if (!image) {
    console.error("No image data found in the H3 neighbor texture.");
    return;
  }
  const { data, width, height } = image;

  // Create an Uint8ClampedArray from the underlying data
  // This is necessary because ImageData expects pixel data in a Uint8ClampedArray.
  const clampedArray = new Uint8ClampedArray(
    data.buffer,
    data.byteOffset,
    data.byteLength
  );

  // Create a temporary canvas with the texture's dimensions.
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Unable to obtain a 2D context from the canvas.");
    return;
  }

  // Create an ImageData object from the pixel data and draw it to the canvas.
  const imageData = new ImageData(clampedArray, width, height);
  ctx.putImageData(imageData, 0, 0);

  // Convert the canvas content to a PNG blob and trigger a download.
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `h3_neighbor_texture.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
}

export const loadNeighborTexture = () => {
  return new Promise((resolve, _reject) => {
    const loader = new TextureLoader();
    loader.load("textures/hex/neighbors.png", (texture) => {
      texture.format = RGBAFormat;
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.generateMipmaps = false;
      texture.type = UnsignedByteType;
      texture.needsUpdate = true;
      resolve(texture);
    });
  });
};
