import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { FaceQuadtree } from "./FaceQuadtree";
import { CubeFace, FaceTransform, NodeBufferConfig } from "./types";
import { UnifiedNodeBuffer } from "./UnifiedNodeBuffer";

export class ImprovedCubicQuadtree {
  private buffer: UnifiedNodeBuffer;
  private faces: Map<CubeFace, FaceQuadtree>;
  private faceTransforms: Map<CubeFace, FaceTransform>;
  private radius: number;
  private minDistanceThreshold: number;

  constructor(config: NodeBufferConfig) {
    this.buffer = new UnifiedNodeBuffer(config);
    this.faces = new Map();
    this.radius = config.radius;
    this.minDistanceThreshold = config.minDistanceThreshold;
    this.faceTransforms = this.initializeFaceTransforms();
    this.initializeFaces();
  }

  private initializeFaceTransforms(): Map<CubeFace, FaceTransform> {
    const transforms = new Map();

    // Front face (no rotation needed)
    transforms.set(CubeFace.FRONT, {
      rotation: new Vector3(0, 0, 0),
      translation: new Vector3(0, 0, 1),
    });

    // Right face
    transforms.set(CubeFace.RIGHT, {
      rotation: new Vector3(0, -Math.PI / 2, 0),
      translation: new Vector3(1, 0, 0),
    });

    // Back face
    transforms.set(CubeFace.BACK, {
      rotation: new Vector3(0, Math.PI, 0),
      translation: new Vector3(0, 0, -1),
    });

    // Left face
    transforms.set(CubeFace.LEFT, {
      rotation: new Vector3(0, Math.PI / 2, 0),
      translation: new Vector3(-1, 0, 0),
    });

    // Top face
    transforms.set(CubeFace.TOP, {
      rotation: new Vector3(Math.PI / 2, 0, 0),
      translation: new Vector3(0, 1, 0),
    });

    // Bottom face
    transforms.set(CubeFace.BOTTOM, {
      rotation: new Vector3(-Math.PI / 2, 0, 0),
      translation: new Vector3(0, -1, 0),
    });

    return transforms;
  }

  private initializeFaces(): void {
    Object.values(CubeFace).forEach((face) => {
      if (typeof face === "number") {
        this.faces.set(
          face,
          new FaceQuadtree(
            this.buffer,
            face,
            this.radius,
            this.minDistanceThreshold
          )
        );
      }
    });
  }

  private transformPointToFace(point: Vector3, face: CubeFace): Vector3 {
    // First, normalize the point to get direction from center
    const direction = point.clone().normalize();

    // Project onto unit cube first
    const absX = Math.abs(direction.x);
    const absY = Math.abs(direction.y);
    const absZ = Math.abs(direction.z);
    const maxComponent = Math.max(absX, absY, absZ);

    // Scale to unit cube
    direction.x /= maxComponent;
    direction.y /= maxComponent;
    direction.z /= maxComponent;

    // Apply face transform
    const transform = this.faceTransforms.get(face)!;
    const matrix = new Matrix4();
    matrix.makeRotationFromEuler(
      new Euler(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        "XYZ"
      )
    );

    direction.applyMatrix4(matrix);

    // After transform, z should be 1 or -1
    // Return x,y coordinates on the face
    return new Vector3(direction.x, direction.y, 0);
  }

  public worldToFaceCoordinates(point: Vector3): {
    face: CubeFace;
    uv: Vector3;
  } {
    const face = this.determinePointFace(point);
    const uv = this.transformPointToFace(point, face);
    return { face, uv };
  }

  public faceToWorldCoordinates(face: CubeFace, x: number, y: number): Vector3 {
    // Create point on unit cube face
    const point = new Vector3(x, y, 1).normalize();

    // Apply inverse face transform
    const transform = this.faceTransforms.get(face)!;
    const matrix = new Matrix4();
    matrix.makeRotationFromEuler(
      new Euler(
        -transform.rotation.x,
        -transform.rotation.y,
        -transform.rotation.z,
        "ZYX" // Inverse order for inverse transform
      )
    );

    point.applyMatrix4(matrix);

    // Scale to radius
    return point.multiplyScalar(this.radius);
  }

  public insert(point: Vector3): void {
    const { face, uv } = this.worldToFaceCoordinates(point);
    this.faces.get(face)?.insert(uv);
  }

  // Helper method to get points for visualization
  public getFaceCorners(face: CubeFace): Vector3[] {
    const corners = [
      new Vector3(-1, -1, 1),
      new Vector3(1, -1, 1),
      new Vector3(1, 1, 1),
      new Vector3(-1, 1, 1),
    ];

    const transform = this.faceTransforms.get(face)!;
    const matrix = new Matrix4();
    matrix.makeRotationFromEuler(
      new Euler(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        "XYZ"
      )
    );

    return corners.map((corner) => {
      return corner
        .applyMatrix4(matrix)
        .normalize()
        .multiplyScalar(this.radius);
    });
  }

  private determinePointFace(point: Vector3): CubeFace {
    const absX = Math.abs(point.x);
    const absY = Math.abs(point.y);
    const absZ = Math.abs(point.z);

    if (absX >= absY && absX >= absZ) {
      return point.x > 0 ? CubeFace.RIGHT : CubeFace.LEFT;
    } else if (absY >= absX && absY >= absZ) {
      return point.y > 0 ? CubeFace.TOP : CubeFace.BOTTOM;
    } else {
      return point.z > 0 ? CubeFace.FRONT : CubeFace.BACK;
    }
  }

  public reset(): void {
    this.buffer.reset();
    this.initializeFaces();
  }

  public getBuffer(): UnifiedNodeBuffer {
    return this.buffer;
  }

  public getRadius(): number {
    return this.radius;
  }

  public getFaceRotation(face: CubeFace): Quaternion {
    const transform = this.faceTransforms.get(face)!;
    return new Quaternion().setFromEuler(
      new Euler(
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        "XYZ"
      )
    );
  }
}
