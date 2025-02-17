import * as h3 from "h3-js";
import { MathUtils, Vector3 } from "three";

let cachedAllNodes: string[] = [];
let cachedIndexMap: Map<string, number> = new Map();

export class HexGrid {
  private static indexMap: Map<string, number> = cachedIndexMap;
  constructor(public resolution: number) {}

  public static getIndex(h3Index: string) {
    return HexGrid.indexMap.get(h3Index);
  }

  public allNodes() {
    return HexGrid.allNodes(this.resolution);
  }

  static allNodes(resolution: number) {
    if (cachedAllNodes.length > 0 && cachedIndexMap.size > 0) {
      console.log(
        "[cached] ALL NODES: ",
        cachedAllNodes.length,
        cachedIndexMap.size
      );
      return cachedAllNodes;
    }
    cachedAllNodes = h3.getRes0Cells().flatMap((h3Index) => {
      const children = h3.cellToChildren(h3Index, resolution);
      children.forEach((child) => {
        HexGrid.indexMap.set(child, HexGrid.indexMap.size);
      });
      return children;
    });
    console.log(
      "[un-cached] ALL NODES: ",
      cachedAllNodes.length,
      cachedIndexMap.size
    );

    return cachedAllNodes;
  }

  /**
   * Computes the 3D position for the center of an H3 cell on a unit sphere.
   * Converts the cell's (lat, lng) obtained via h3.cellToLatLng into Cartesian coordinates.
   */
  static getPositionFromH3(
    h3Index: string,
    target: Vector3 = new Vector3()
  ): Vector3 {
    const [lat, lng] = h3.cellToLatLng(h3Index);
    return target.setFromSphericalCoords(
      1,
      MathUtils.degToRad(90 - lat),
      MathUtils.degToRad(lng)
    );
  }

  /**
   * Encodes an incremental node index to a color.
   * The returned color is a 4-element array [r, g, b, a] where
   * each channel is a normalized float (0 to 1). Assumes index < 2^24.
   */
  static encodeNodeIndexToColor(
    index: number
  ): [number, number, number, number] {
    // Use full 24-bit capacity
    const r = (index >> 16) & 0xff; // bits 16-23
    const g = (index >> 8) & 0xff; // bits 8-15
    const b = index & 0xff; // bits 0-7
    return [r / 255, g / 255, b / 255, 1.0];
  }

  /**
   * Decodes a color (represented as [r, g, b, a] with channels in the range 0-1)
   * back into the incremental node index.
   */
  static decodeColorToNodeIndex(
    color: [number, number, number, number]
  ): number {
    const r = Math.round(color[0] * 255);
    const g = Math.round(color[1] * 255);
    const b = Math.round(color[2] * 255);
    return (r << 16) | (g << 8) | b;
  }
}
