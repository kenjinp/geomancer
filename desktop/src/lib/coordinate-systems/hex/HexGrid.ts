import * as h3 from "h3-js";
import { MathUtils, Vector3 } from "three";
import { LatLong } from "../sphere/LatLong";

let cachedAllNodes: string[] = [];
let cachedIndexMap: Map<string, number> = new Map();

export class HexGrid {
  public static readonly indexMap: Map<string, number> = cachedIndexMap;
  public static readonly reverseIndexMap: Map<number, string> = new Map();

  constructor(public resolution: number) {}

  public static getIndex(h3Index: string) {
    return HexGrid.indexMap.get(h3Index);
  }

  public static getH3Index(index: number) {
    return HexGrid.reverseIndexMap.get(index);
  }

  public allNodes() {
    return HexGrid.allNodes(this.resolution);
  }

  public static getNumCells(resolution: number) {
    return h3.getNumCells(resolution);
  }

  public getNumCells() {
    return h3.getNumCells(this.resolution);
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
    const presorted = h3
      .getRes0Cells()
      .flatMap((h3Index) => h3.cellToChildren(h3Index, resolution));
    const sorted = presorted.sort((a, b) => {
      return Number(a) - Number(b);
    });

    cachedAllNodes = sorted.map((h3Index, sortedIndex) => {
      HexGrid.indexMap.set(h3Index, sortedIndex);
      HexGrid.reverseIndexMap.set(sortedIndex, h3Index);
      return h3Index;
    });
    console.log(
      "[un-cached] ALL NODES: ",
      cachedAllNodes.length,
      cachedIndexMap.size
    );

    return cachedAllNodes;
  }

  /**
   * Returns a tile index from a NOMRALIZED cartesian position
   * @param position
   * @param resolution
   */
  static getIndexFromPosition(position: Vector3, resolution: number): number {
    const ll = LatLong.cartesianToLatLong(position);
    // TODO figure out why this is upside-down!
    const cell = h3.latLngToCell(-ll.lat, ll.lon, resolution);
    return HexGrid.getIndex(cell);
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
      MathUtils.degToRad(90 + lat),
      MathUtils.degToRad(lng)
    );
  }

  /**
   * Computes the sphere position for the center of an H3 cell on a unit sphere.
   */
  static getLatLongFromH3(
    h3Index: string,
    target: LatLong = new LatLong()
  ): LatLong {
    const [lat, lng] = h3.cellToLatLng(h3Index);
    return target.set(lat, lng);
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
