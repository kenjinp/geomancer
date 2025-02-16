import { Vector3 } from "three";
import { LatLong } from "../LatLong";

/**
 * Reusable Vector3 instance to avoid allocations
 */
const tempVector = new Vector3();

export enum CubeFace {
  FRONT = 0, // Front face (+Z)
  BACK = 1, // Back face (-Z)
  RIGHT = 2, // Right face (+X)
  LEFT = 3, // Left face (-X)
  TOP = 4, // Top face (+Y)
  BOTTOM = 5, // Bottom face (-Y)
}

/**
 * Represents a point on a cube map using face index and UV coordinates.
 * UV coordinates are normalized to [0,1] range on each face.
 */
export class CubicCoordinates {
  /**
   * Creates a new CubicCoordinates instance
   * @param face - Index of cube face (0-5)
   * @param u - Horizontal coordinate on face (0-1)
   * @param v - Vertical coordinate on face (0-1)
   */
  constructor(
    public face: number = 0,
    public u: number = 0,
    public v: number = 0
  ) {}

  /**
   * Updates the coordinates
   * @returns this for method chaining
   */
  set(face: number, u: number, v: number): this {
    this.face = face;
    this.u = u;
    this.v = v;
    return this;
  }

  /**
   * Creates a copy of this CubicCoordinates
   */
  clone(): CubicCoordinates {
    return new CubicCoordinates(this.face, this.u, this.v);
  }

  /**
   * Copies values from another CubicCoordinates
   * @returns this for chaining
   */
  copy(other: CubicCoordinates): this {
    this.face = other.face;
    this.u = other.u;
    this.v = other.v;
    return this;
  }

  /**
   * Converts cube coordinates to a 3D direction vector.
   * The resulting vector points from the cube center to the face position.
   */
  toVector3(): Vector3 {
    // Convert UV from [0,1] to [-1,1] range
    const s = 2 * this.u - 1;
    const t = 2 * this.v - 1;

    // Map 2D face coordinates to 3D direction based on face index
    switch (this.face) {
      case CubeFace.FRONT:
        return new Vector3(s, t, 1); // Front face (+Z)
      case CubeFace.BACK:
        return new Vector3(-s, t, -1); // Back face (-Z)
      case CubeFace.RIGHT:
        return new Vector3(1, t, -s); // Right face (+X)
      case CubeFace.LEFT:
        return new Vector3(-1, t, s); // Left face (-X)
      case CubeFace.TOP:
        return new Vector3(s, 1, -t); // Top face (+Y)
      case CubeFace.BOTTOM:
        return new Vector3(s, -1, t); // Bottom face (-Y)
      default:
        throw new Error(`Invalid face: ${this.face}`);
    }
  }

  /**
   * Converts cube coordinates to latitude/longitude.
   * @param target - Optional LatLong instance to store result
   */
  toLatLong(target?: LatLong): LatLong {
    const vec = tempVector;
    vec.copy(this.toVector3()).normalize();
    return LatLong.cartesianToLatLong(vec, target);
  }

  /**
   * Converts latitude/longitude coordinates to cube map coordinates.
   * Uses the face with the largest projection for best precision.
   *
   * @param latLong - Input latitude/longitude coordinates
   * @param radius - Sphere radius (default: 1)
   * @param target - Optional CubicCoordinates to store result
   */
  static latLongToCubeUV(
    latLong: LatLong,
    radius: number = 1,
    target: CubicCoordinates = new CubicCoordinates()
  ): CubicCoordinates {
    // Convert lat/long to 3D direction vector
    const vec = tempVector;
    latLong.toCartesian(radius, vec);

    const { x, y, z } = vec;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);

    let face: CubeFace;
    let uc: number;
    let vc: number;
    let maxAxis: number;

    // Select cube face based on largest absolute coordinate
    if (absX >= absY && absX >= absZ) {
      // X-axis dominant
      maxAxis = absX;
      if (x > 0) {
        face = CubeFace.RIGHT;
        uc = z; // Map Z to U
        vc = y; // Map Y to V
      } else {
        face = CubeFace.LEFT;
        uc = -z; // Flip Z for left face
        vc = y;
      }
    } else if (absY >= absZ) {
      // Y-axis dominant
      maxAxis = absY;
      if (y > 0) {
        face = CubeFace.TOP;
        uc = x; // Map X to U
        vc = z; // Map Z to V
      } else {
        face = CubeFace.BOTTOM;
        uc = x;
        vc = -z; // Flip Z for bottom face
      }
    } else {
      // Z-axis dominant
      maxAxis = absZ;
      if (z > 0) {
        face = CubeFace.FRONT;
        uc = -x; // Flip X for front face
        vc = y; // Map Y to V
      } else {
        face = CubeFace.BACK;
        uc = x;
        vc = y;
      }
    }

    // Project to face plane by dividing by largest component
    uc /= maxAxis;
    vc /= maxAxis;

    // Convert from [-1,1] to [0,1] range
    return target.set(face, (uc + 1) / 2, (vc + 1) / 2);
  }

  /**
   * Creates CubicCoordinates from normalized direction vector
   * @param direction - Normalized 3D direction vector
   * @param target - Optional instance to reuse
   */
  static fromDirection(
    direction: Vector3,
    target: CubicCoordinates = new CubicCoordinates()
  ): CubicCoordinates {
    return this.latLongToCubeUV(
      LatLong.cartesianToLatLong(direction),
      1,
      target
    );
  }

  /**
   * Converts latitude/longitude coordinates to cube face UV coordinates
   * @param latLong - Input latitude/longitude coordinates
   * @param target - Optional CubicCoordinates instance to reuse
   * @returns CubicCoordinates with face index and UV position
   */
  static fromLatLong(
    latLong: LatLong,
    target: CubicCoordinates = new CubicCoordinates()
  ): CubicCoordinates {
    return this.latLongToCubeUV(latLong, 1, target);
  }

  /**
   * Converts to array [face, u, v] for easy serialization
   */
  toArray(): [number, number, number] {
    return [this.face, this.u, this.v];
  }

  /**
   * Checks equality with another CubicCoordinates instance
   */
  equals(other: CubicCoordinates): boolean {
    return (
      this.face === other.face &&
      Math.abs(this.u - other.u) < 1e-6 &&
      Math.abs(this.v - other.v) < 1e-6
    );
  }

  // Add static constructor from UV values
  static fromUV(face: CubeFace, u: number, v: number): CubicCoordinates {
    return new CubicCoordinates(face, u, v);
  }

  // TODO: The following methods are used for the cube sphere quadtree
  // And should probably be moved to a separate class

  // Add tile coordinate conversion
  public getTileCoordinates(level: number): { x: number; y: number } {
    const scale = 1 << level;
    return {
      x: Math.floor(this.u * scale),
      y: Math.floor(this.v * scale),
    };
  }

  // Add level-based parent/child calculations
  public getParentCoordinates(level: number): { x: number; y: number } {
    return {
      x: Math.floor(this.u * (1 << (level - 1))),
      y: Math.floor(this.v * (1 << (level - 1))),
    };
  }

  public getChildIndex(level: number): number {
    const scale = 1 << level;
    const x = Math.floor(this.u * scale) % 2;
    const y = Math.floor(this.v * scale) % 2;
    return y * 2 + x;
  }

  // Add normalized vector accessor
  public toNormalizedVector(): Vector3 {
    return this.toVector3().normalize();
  }

  // Add array conversion
  public toFloat32Array(): Float32Array {
    return new Float32Array(this.toVector3().toArray());
  }
}
