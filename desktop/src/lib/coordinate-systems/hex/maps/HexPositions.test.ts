import { DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HexGrid } from "../HexGrid";
import { generateH3PositionTexture } from "./HexPositions";

describe("generateH3PositionTexture", () => {
  // Save original static methods to restore after tests
  let originalAllNodes = HexGrid.allNodes;
  let originalGetPositionFromH3 = HexGrid.getPositionFromH3;
  let originalGetIndex = HexGrid.getIndex;

  // Use a small array of fake H3 nodes for testing.
  const fakeNodes = ["hex1", "hex2", "hex3"];
  const fakeIndexMap = new Map<string, number>([
    ["hex1", 0],
    ["hex2", 1],
    ["hex3", 2],
  ]);

  beforeEach(() => {
    // Override HexGrid methods to use controlled fake data.
    HexGrid.allNodes = (_resolution: number) => fakeNodes;
    HexGrid.getIndex = (h3Index: string) => fakeIndexMap.get(h3Index) as number;
    HexGrid.getPositionFromH3 = (h3Index: string) => {
      const idx = fakeIndexMap.get(h3Index);
      if (idx === undefined) throw new Error("Invalid h3 index");
      // For testing we return a stubbed position:
      // x = idx, y = idx + 10, z = idx + 20.
      return { x: idx, y: idx + 10, z: idx + 20 };
    };
  });

  afterEach(() => {
    // Restore original methods.
    HexGrid.allNodes = originalAllNodes;
    HexGrid.getPositionFromH3 = originalGetPositionFromH3;
    HexGrid.getIndex = originalGetIndex;
  });

  it("creates a DataTexture with encoded positions", () => {
    const texture = generateH3PositionTexture(4);

    // With fakeNodes.length === 3, we have:
    // texWidth = min(3, 4096) === 3 and texHeight = ceil(3 / 3) === 1.
    expect(texture).toBeInstanceOf(DataTexture);
    expect(texture.image.width).toEqual(3);
    expect(texture.image.height).toEqual(1);

    // The underlying position data should have 3 * 4 === 12 elements.
    const expectedLength = 3 * 1 * 4;
    expect(texture.image.data.length).toEqual(expectedLength);

    // Validate the encoded positions:
    // Node 'hex1' (fake index 0): position {x: 0, y: 10, z: 20}
    // Node 'hex2' (fake index 1): position {x: 1, y: 11, z: 21}
    // Node 'hex3' (fake index 2): position {x: 2, y: 12, z: 22}
    const data = texture.image.data;
    // For 'hex1'
    expect(data[0]).toEqual(0);
    expect(data[1]).toEqual(10);
    expect(data[2]).toEqual(20);
    expect(data[3]).toEqual(0); // Padding

    // For 'hex2'
    expect(data[4]).toEqual(1);
    expect(data[5]).toEqual(11);
    expect(data[6]).toEqual(21);
    expect(data[7]).toEqual(0); // Padding

    // For 'hex3'
    expect(data[8]).toEqual(2);
    expect(data[9]).toEqual(12);
    expect(data[10]).toEqual(22);
    expect(data[11]).toEqual(0); // Padding

    // Validate texture settings.
    expect(texture.format).toEqual(RGBAFormat);
    expect(texture.type).toEqual(FloatType);
    expect(texture.minFilter).toEqual(NearestFilter);
    expect(texture.magFilter).toEqual(NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
  });

  it("throws an error if index mismatch occurs", () => {
    // Force an index mismatch by making getIndex always return -1.
    HexGrid.getIndex = () => -1;
    expect(() => generateH3PositionTexture(4)).toThrowError(/Index mismatch/);
  });

  it("verifies that all the positions inside are unique", () => {
    const texture = generateH3PositionTexture(4);
    const data = texture.image.data;

    const seen = new Set<string>();
    // Each texel's data is stored as [x,y,z, padding], so step by 4.
    for (let i = 0; i < data.length; i += 4) {
      // Create a key based on x,y,z values.
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      expect(seen.has(key)).toBe(false); // Ensure position hasn't been seen.
      seen.add(key);
    }

    // Verify that the unique position count equals the number of texels.
    const numPositions = data.length / 4;
    expect(seen.size).toEqual(numPositions);
  });
});
