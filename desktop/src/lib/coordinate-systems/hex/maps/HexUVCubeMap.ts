import * as h3 from "h3-js";
import {
  CubeTexture,
  DataTexture,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { CubicCoordinates } from "../../cube-projection/CubicCoordinates";
import { HexGrid } from "../HexGrid";

export function generateH3CubeMap(resolution = 4, faceSize = 1024) {
  const startTime = performance.now();
  // warm the cache
  const allIndices = HexGrid.allNodes(resolution);
  if (allIndices.length > 16777215) {
    // 24-bit limit
    throw new Error(
      `H3 resolution ${resolution} produces too many indices (${allIndices.length}) for 24-bit color encoding`
    );
  }

  // Create a single Uint8Array to hold all six cube face images.
  const cubeRgba = new Uint8Array(6 * faceSize * faceSize * 4);

  // For each cube face
  for (let face = 0; face < 6; face++) {
    for (let y = 0; y < faceSize; y++) {
      for (let x = 0; x < faceSize; x++) {
        const cubicCoords = new CubicCoordinates(
          face,
          x / faceSize,
          y / faceSize
        );
        const latLong = cubicCoords.toLatLong();
        const h3Index = h3.latLngToCell(latLong.lat, latLong.lon, resolution);
        const incrementalIndex = HexGrid.getIndex(h3Index);
        // Convert H3 index to a color (using the last 24 bits in this example)
        const color = HexGrid.encodeNodeIndexToColor(incrementalIndex);

        // Write the color values into the buffer.
        const offset = (face * faceSize * faceSize + y * faceSize + x) * 4;
        cubeRgba[offset] = Math.round(color[0] * 255);
        cubeRgba[offset + 1] = Math.round(color[1] * 255);
        cubeRgba[offset + 2] = Math.round(color[2] * 255);
        cubeRgba[offset + 3] = 255;
      }
    }
  }

  // Create six DataTextures from the correct slices of the buffer,
  // one for each cube face.
  const images = [];
  for (let face = 0; face < 6; face++) {
    const offset = face * faceSize * faceSize * 4;
    const faceData = cubeRgba.subarray(
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
  return cubeTexture;
}
