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
  neighborData.fill(-1);

  let index = 0;
  for (const h3Index of allIndices) {
    const neighbors = h3.gridDisk(h3Index, 1).filter((n) => n !== h3Index);
    const paddedNeighbors = [];
    for (let i = 0; i < 6; i++) {
      // Use 0xFFFFFFFF as sentinel for missing neighbors
      paddedNeighbors[i] =
        i < neighbors.length ? neighbors[i] : "FFFFFFFFFFFFFFFF";
    }

    for (let i = 0; i < 6; i++) {
      const neighborH3 = paddedNeighbors[i];
      const neighborIndex =
        neighborH3 === "FFFFFFFFFFFFFFFF" ? -1 : HexGrid.getIndex(neighborH3);
      // Encode -1 as [255, 255, 255]
      const color =
        neighborIndex >= 0
          ? HexGrid.encodeNodeIndexToColor(neighborIndex)
          : [1, 1, 1, 1];
      const offset = index * 4;
      neighborData[offset] = Math.round(color[0] * 255);
      neighborData[offset + 1] = Math.round(color[1] * 255);
      neighborData[offset + 2] = Math.round(color[2] * 255);
      neighborData[offset + 3] = 255; // A
      index++;

      // Add validation check
      if (neighborIndex >= allIndices.length) {
        console.error("Invalid neighbor index", neighborIndex);
        throw new Error("Invalid neighbor index");
      }
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
