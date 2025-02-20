import * as h3 from "h3-js";
import { DataTexture, FloatType, RGBAFormat, Vector3 } from "three";
import { LatLong } from "../../sphere/LatLong";
import { HexGrid } from "../HexGrid";

export function generateH3VertexTexture(resolution = 4) {
  const allIndices = HexGrid.allNodes(resolution);
  const texWidth = 6; // 6 vertices per hex
  const texHeight = Math.ceil(allIndices.length / 2); // Store 2 hexes per texel (RGBA=4 components)

  const vertexData = new Float32Array(texWidth * texHeight * 4);

  allIndices.forEach((h3Index, i) => {
    const vertices = h3
      .cellToBoundary(h3Index)
      .map(([lat, lng]) => new LatLong(lat, lng).toCartesian(1, new Vector3()));

    const baseOffset = Math.floor(i / 2) * 24 + (i % 2) * 12;
    vertices.forEach((vert, vi) => {
      vertexData[baseOffset + vi * 3] = vert.x;
      vertexData[baseOffset + vi * 3 + 1] = vert.y;
      vertexData[baseOffset + vi * 3 + 2] = vert.z;
    });
  });

  return new DataTexture(
    vertexData,
    texWidth,
    texHeight,
    RGBAFormat,
    FloatType
  );
}
