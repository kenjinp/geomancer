import { describe, expect, it } from "vitest";
import { HexGrid } from "../HexGrid";
import { generateH3CubeMap } from "./HexUVCubeMap";

describe("generateH3CubeMap", () => {
  it(
    "generates a cube map with exactly 288122 unique indexes",
    () => {
      const resolution = 4;
      const faceSize = 512;
      const cubeTexture = generateH3CubeMap(resolution, faceSize);

      const uniqueIndexes = new Set<number>();

      // cubeTexture.images is an array of DataTextures (one for each of the 6 faces)
      cubeTexture.images.forEach((faceTexture) => {
        // faceTexture.image.data is a Uint8Array with 4 bytes per pixel (RGBA)
        const data = faceTexture.image.data as Uint8Array;
        for (let i = 0; i < data.length; i += 4) {
          // Read the R, G, B channels and normalize them as expected by decodeColorToNodeIndex.
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Create normalized color channels. Alpha is always 1.
          const normalizedColor: [number, number, number, number] = [
            r / 255,
            g / 255,
            b / 255,
            1,
          ];
          const index = HexGrid.decodeColorToNodeIndex(normalizedColor);
          uniqueIndexes.add(index);
        }
      });

      // Assert that the total number of unique indexes equals the expected 288122.
      expect(uniqueIndexes.size).toEqual(288122);
    },
    {
      timeout: 45_000,
    }
  );
});
