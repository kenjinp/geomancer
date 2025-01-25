import { DataTexture, IntType, RGBAIntegerFormat } from "three";

export function createPaddedDataTexture(data: Int32Array) {
  const elementsPerTexel = 4; // RGBA
  const width = Math.ceil(Math.sqrt(data.length / elementsPerTexel));
  const height = Math.ceil(data.length / elementsPerTexel / width);
  const paddedSize = width * height * elementsPerTexel;

  const paddedData = new Int32Array(paddedSize);
  paddedData.set(data);

  const texture = new DataTexture(
    paddedData,
    width,
    height,
    RGBAIntegerFormat,
    IntType
  );
  texture.needsUpdate = true;

  return texture;
}
