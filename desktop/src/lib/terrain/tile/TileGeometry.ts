import { PlaneGeometry } from "three";

export class TileGeometry extends PlaneGeometry {
  constructor(
    width?: number,
    height?: number,
    widthSegments?: number,
    heightSegments?: number
  ) {
    super(
      width ?? 10,
      height ?? 10,
      widthSegments ?? 500,
      heightSegments ?? 500
    );
    // this.deleteAttribute("uv");
    // this.deleteAttribute("normal");
    this.rotateX(-Math.PI * 0.5);
  }
}
