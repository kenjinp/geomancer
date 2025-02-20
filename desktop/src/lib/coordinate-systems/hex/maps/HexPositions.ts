import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  TextureLoader,
} from "three";
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

export function downloadH3PositionTexture(texture: DataTexture) {
  // Generate the position texture using your existing method.
  const image = texture.image;
  if (!image) {
    console.error("No image data found in the H3 position texture.");
    return;
  }
  const { data, width, height } = image;

  // "data" is a Float32Array. Each float is 4 bytes so the total byte count is:
  // width * height * 4 (floats per pixel) * 4 (bytes per float) = 16 * (width * height)
  // In order to store these 16 bytes per "original pixel" into a PNG (which expects 4 bytes per pixel),
  // we create a canvas 2x the width and height, because:
  // (width * 2) * (height * 2) * 4 bytes = 16 * width * height.
  const newWidth = width * 2;
  const newHeight = height * 2;

  // Reinterpret the float data as raw bytes.
  const byteData = new Uint8ClampedArray(
    data.buffer,
    data.byteOffset,
    data.byteLength
  );

  // Create a temporary canvas to pack our raw bytes.
  const canvas = document.createElement("canvas");
  canvas.width = newWidth;
  canvas.height = newHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Unable to obtain 2D context.");
    return;
  }

  // Create an ImageData object from our raw bytes.
  // The length of "byteData" should equal newWidth * newHeight * 4.
  const imageData = new ImageData(byteData, newWidth, newHeight);
  ctx.putImageData(imageData, 0, 0);

  // Convert the canvas content to a PNG blob and trigger a download.
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `h3_position_texture.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, "image/png");
}

export const loadPositionTexture = () => {
  return new Promise((resolve, _reject) => {
    const loader = new TextureLoader();
    loader.load("textures/hex/positions.png", (texture) => {
      texture.format = RGBAFormat;
      texture.minFilter = NearestFilter;
      texture.magFilter = NearestFilter;
      texture.type = FloatType;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      resolve(texture);
    });
  });
};
