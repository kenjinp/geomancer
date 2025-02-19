import { DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";
import { HexGrid } from "../HexGrid";

export function generateH3PositionTexture(resolution = 4) {
  // Get sorted nodes from HexGrid using the new helper method
  const allIndices = HexGrid.allNodes(resolution);
  const totalCells = allIndices.length;

  // Calculate texture dimensions (stay within WebGL limits)
  const MAX_TEXTURE_SIZE = 4096;
  const texWidth = Math.min(totalCells, MAX_TEXTURE_SIZE);
  const texHeight = Math.ceil(totalCells / texWidth) || 1;

  // Validate texture can hold all cells
  if (texWidth * texHeight < totalCells) {
    throw new Error("Texture dimensions too small");
  }

  // Ensure minimum texture dimensions for WebGL
  const MIN_TEXTURE_DIM = 64;
  if (texWidth < MIN_TEXTURE_DIM || texHeight < MIN_TEXTURE_DIM) {
    console.warn(
      `Position texture dimensions (${texWidth}x${texHeight}) below recommended minimum of ${MIN_TEXTURE_DIM}x${MIN_TEXTURE_DIM}`
    );
  }

  // Create a Float32Array to hold the position data (RGBA for each texel)
  const positionData = new Float32Array(texWidth * texHeight * 4);
  positionData.fill(-1);

  // Loop over all sorted H3 indices and compute their 3D positions

  for (let i = 0; i < allIndices.length; i++) {
    const h3Index = allIndices[i];
    if (i !== HexGrid.getIndex(h3Index)) {
      throw new Error(`Index mismatch, ${i}, ${h3Index}`);
    }

    const pos = HexGrid.getPositionFromH3(h3Index);
    const offset = i * 4;
    positionData[offset] = pos.x;
    positionData[offset + 1] = pos.y;
    positionData[offset + 2] = pos.z;
    positionData[offset + 3] = 0.0; // Padding for alignment
  }

  const texture = new DataTexture(
    positionData,
    texWidth,
    texHeight,
    RGBAFormat,
    FloatType
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.type = FloatType;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
