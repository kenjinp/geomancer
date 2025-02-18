import * as h3 from "h3-js";
import { CubeTexture, DataTexture } from "three";
import { describe, expect, it } from "vitest";
import { CubicCoordinates } from "../../cube-projection/CubicCoordinates";
import { HexGrid } from "../HexGrid";
import { generateH3PositionTexture } from "./HexPositions";
import { generateH3CubeMap } from "./HexUVCubeMap";

describe("generateH3CubeMap", () => {
  it(
    "generates a cube map with exactly 288122 unique indexes",
    {
      timeout: 45_000,
    },
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
    }
  );
});

// New test verifying that each texel is within 26 * 2 (52 km) of its H3 cell center position.
describe("Texel Cell Center Proximity", () => {
  it(
    "ensures that each texel's corresponding lat/long is within 52 km (26*2) of its h3 cell center",
    {
      timeout: 45_000,
    },
    () => {
      const resolution = 4;
      const faceSize = 512;
      const threshold = 23_738.56 * 1.5; // 52 km

      // Helper: Compute the great-circle (haversine) distance in km between two lat/long points.
      function haversineDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
      ): number {
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const R = 6371; // Earth's radius in km
        return R * c;
      }

      // Loop over every texel using the original custom face order (0 to 5).
      for (let face = 0; face < 6; face++) {
        for (let y = 0; y < faceSize; y++) {
          for (let x = 0; x < faceSize; x++) {
            const u = x / faceSize;
            const v = y / faceSize;
            const cubicCoords = new CubicCoordinates(face, u, v);
            const texelLatLong = cubicCoords.toLatLong(); // Returns { lat, lon }
            const h3Index = h3.latLngToCell(
              texelLatLong.lat,
              texelLatLong.lon,
              resolution
            );
            const cellCenter = h3.cellToLatLng(h3Index); // Returns [lat, lon]
            const distance = haversineDistance(
              texelLatLong.lat,
              texelLatLong.lon,
              cellCenter[0],
              cellCenter[1]
            );
            // Assert the distance is within threshold.
            expect(
              distance,
              `distance: ${distance} is greater than threshold: ${threshold} for face: ${face}, y: ${y}, x: ${x}`
            ).toBeLessThanOrEqual(threshold);
          }
        }
      }
    }
  );
});

// New test reading from the hexPosition texture.
describe("HexPosition Texture Sampling", () => {
  it(
    "verifies that positions from the hexPosition texture are within 24k*1.5 (36 km) of the sampled point",
    {
      timeout: 45_000,
    },
    () => {
      const resolution = 4;
      const faceSize = 512;
      const cubeTexture = generateH3CubeMap(resolution, faceSize);
      // Assume HexGrid provides the hexPosition texture.
      const hexPosTexture = generateH3PositionTexture();

      // Threshold: 24k * 1.5, assuming 24k means 24000 meters (i.e. 24 km), so 36 km in total.
      const threshold = (24_000 * 1.5) / 1000; // in km, equals 36 km

      // Helper: sample cube map texture given a direction vector.
      function sampleCubeMap(
        texture: CubeTexture,
        dir: { x: number; y: number; z: number }
      ): [number, number, number, number] {
        const { x, y, z } = dir;
        const absX = Math.abs(x),
          absY = Math.abs(y),
          absZ = Math.abs(z);
        let faceIndex: number;
        let u: number, v: number;

        if (absX >= absY && absX >= absZ) {
          if (x > 0) {
            faceIndex = 0; // +X
            u = -z / absX;
            v = -y / absX;
          } else {
            faceIndex = 1; // -X
            u = z / absX;
            v = -y / absX;
          }
        } else if (absY >= absX && absY >= absZ) {
          if (y > 0) {
            faceIndex = 2; // +Y
            u = x / absY;
            v = z / absY;
          } else {
            faceIndex = 3; // -Y
            u = x / absY;
            v = -z / absY;
          }
        } else {
          if (z > 0) {
            faceIndex = 4; // +Z
            u = x / absZ;
            v = -y / absZ;
          } else {
            faceIndex = 5; // -Z
            u = -x / absZ;
            v = -y / absZ;
          }
        }

        // Remap u,v from [-1,1] to [0,1]
        u = (u + 1) / 2;
        v = (v + 1) / 2;

        // Sample from the face texture.
        const faceTexture = texture.images[faceIndex];
        const data = faceTexture.image.data as Uint8Array;
        const size = faceTexture.image.width; // assuming square texture
        const px = Math.min(size - 1, Math.floor(u * size));
        const py = Math.min(size - 1, Math.floor(v * size));
        const offset = (py * size + px) * 4;
        return [
          data[offset] / 255,
          data[offset + 1] / 255,
          data[offset + 2] / 255,
          data[offset + 3] / 255,
        ];
      }

      // Helper: convert a direction vector to latitude and longitude (in degrees).
      function directionToLatLon(dir: { x: number; y: number; z: number }): {
        lat: number;
        lon: number;
      } {
        const lat = Math.asin(dir.y) * (180 / Math.PI);
        const lon = Math.atan2(dir.x, -dir.z) * (180 / Math.PI);
        return { lat, lon };
      }

      // Helper: sample a pixel from the hexPosition texture given an index.
      function sampleHexPositionTexture(
        index: number,
        texture: DataTexture
      ): [number, number, number, number] {
        const data = texture.image.data as Uint8Array;
        // Assume texture is 1D with width equal to the number of hex cells.
        const offset = index * 4;
        return [
          data[offset] / 255,
          data[offset + 1] / 255,
          data[offset + 2] / 255,
          data[offset + 3] / 255,
        ];
      }

      // Helper: compute the haversine distance (in km) between two lat/lon points.
      function haversineDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number
      ): number {
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const R = 6371; // Earth's radius in km.
        return R * c;
      }

      // Run 10 random sample points on the unit sphere.
      for (let i = 0; i < 10; i++) {
        // Generate a random direction.
        let x = Math.random() * 2 - 1;
        let y = Math.random() * 2 - 1;
        let z = Math.random() * 2 - 1;
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len === 0) {
          i--;
          continue;
        }
        x /= len;
        y /= len;
        z /= len;
        const dir = { x, y, z };

        // Sample the hexUVCubeMap and decode the hex index.
        const sampledColor = sampleCubeMap(cubeTexture, dir);
        const hexIndex = HexGrid.decodeColorToNodeIndex(sampledColor);

        // Sample the hexPosition texture for this hex index.
        const posPixel = sampleHexPositionTexture(hexIndex, hexPosTexture);
        // Decode the position; assume this returns an object with { lat, lon }.
        const hexPos = HexGrid.decodeColorToPosition(posPixel);

        // Convert the random direction to latitude/longitude.
        const sampleLatLon = directionToLatLon(dir);

        // Compute the great-circle (haversine) distance.
        const distance = haversineDistance(
          sampleLatLon.lat,
          sampleLatLon.lon,
          hexPos.lat,
          hexPos.lon
        );

        expect(
          distance,
          `Sample ${i}: distance ${distance} km exceeds threshold ${threshold} km for hex index ${hexIndex}`
        ).toBeLessThanOrEqual(threshold);
      }
    }
  );
});
