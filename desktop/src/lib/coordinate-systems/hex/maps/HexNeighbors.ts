import * as h3 from "h3-js";
import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { HexGrid } from "../HexGrid";

export function generateH3NeighborTexture(resolution = 4) {
  const allIndices = HexGrid.allNodes(resolution);
  const totalCells = allIndices.length;
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
      const neighborIndex = HexGrid.getIndex(neighbors[i]) || -1;
      const color = HexGrid.encodeNodeIndexToColor(neighborIndex) || [
        -1, -1, -1,
      ];
      const offset = index * 4;
      neighborData[offset] = Math.round(color[0] * 255);
      neighborData[offset + 1] = Math.round(color[1] * 255);
      neighborData[offset + 2] = Math.round(color[2] * 255);
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
