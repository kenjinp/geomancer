import * as THREE from "three";
import { QuadTree, QuadTreeParams } from "./QuadTree";
import { UnifiedNodeBuffer } from "./UnifiedNodeBuffer";

// Face constants
const FACE_RIGHT = 0; // +X
const FACE_LEFT = 1; // -X
const FACE_TOP = 2; // +Y
const FACE_BOTTOM = 3; // -Y
const FACE_FRONT = 4; // +Z
const FACE_BACK = 5; // -Z
// Edge constants
const EDGE_LEFT = 0; // Left edge of face
const EDGE_RIGHT = 1; // Right edge of face
const EDGE_TOP = 2; // Top edge of face
const EDGE_BOTTOM = 3; // Bottom edge of face
const EDGE_FRONT = 4; // Front edge (used for top/bottom face connections)
const EDGE_BACK = 5; // Back edge (used for top/bottom face connections)

interface FaceTransition {
  targetFace: number;
  rotation: number; // Rotation in radians needed when crossing faces
  flipU: boolean; // Whether to flip the U coordinate
  flipV: boolean; // Whether to flip the V coordinate
}

export class CubicQuadtree {
  private faces: QuadTree[] = [];
  private readonly faceMatrices: THREE.Matrix4[] = [];
  private readonly origin: THREE.Vector3;
  readonly unifiedBuffer: UnifiedNodeBuffer;
  readonly size: number;
  private readonly minNodeSize: number;
  private readonly comparatorValue: number;

  // Face transition lookup table
  private readonly faceTransitions: Map<string, FaceTransition> = new Map();

  // Reusable temporary variables
  private readonly _tempVec3A = new THREE.Vector3();
  private readonly _tempVec3B = new THREE.Vector3();
  private readonly _tempMatrix4 = new THREE.Matrix4();
  private readonly _tempQuat = new THREE.Quaternion();

  constructor(params: Omit<QuadTreeParams, "localToWorld" | "nodeBuffer">) {
    this.origin = params.origin;
    this.size = params.size;
    this.minNodeSize = params.minNodeSize;
    this.comparatorValue = params.comparatorValue;

    // Create unified buffer for 6 faces
    this.unifiedBuffer = new UnifiedNodeBuffer(6);

    this.initializeFaceMatrices();
    this.initializeFaceTransitions();
  }

  private initializeFaceMatrices(): void {
    const matrices = this.faceMatrices;
    const r = this.size;

    let m = this._tempMatrix4.identity();
    // +X (FACE_RIGHT = 0)
    m = this._tempMatrix4.identity();
    m.makeRotationY(Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeTranslation(r, 0, 0));
    matrices.push(m.clone());

    // -X (FACE_LEFT = 1)
    m = this._tempMatrix4.identity();
    m.makeRotationY(-Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeTranslation(-r, 0, 0));
    matrices.push(m.clone());

    // +Y (FACE_TOP = 2)
    m = this._tempMatrix4.identity();
    m.makeRotationX(-Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeTranslation(0, r, 0));
    matrices.push(m.clone());

    // -Y (FACE_BOTTOM = 3)
    m = this._tempMatrix4.identity();
    m.makeRotationX(Math.PI / 2);
    m.premultiply(new THREE.Matrix4().makeTranslation(0, -r, 0));
    matrices.push(m.clone());

    // +Z (FACE_FRONT = 4)
    m = this._tempMatrix4.identity();
    m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, r));
    matrices.push(m.clone());

    // -Z (FACE_BACK = 5)
    m = this._tempMatrix4.identity();
    m.makeRotationY(Math.PI);
    m.premultiply(new THREE.Matrix4().makeTranslation(0, 0, -r));
    matrices.push(m.clone());

    for (let i = 0; i < matrices.length; i++) {
      this.faces.push(
        new QuadTree({
          origin: this.origin,
          size: this.size,
          minNodeSize: this.minNodeSize,
          comparatorValue: this.comparatorValue,
          localToWorld: matrices[i],
          nodeBuffer: this.unifiedBuffer.createBuffer(i),
        })
      );
    }
  }

  private initializeFaceTransitions(): void {
    // Right face (+X) transitions
    this.faceTransitions.set(`${FACE_RIGHT}_${EDGE_TOP}`, {
      targetFace: FACE_TOP,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_RIGHT}_${EDGE_BOTTOM}`, {
      targetFace: FACE_BOTTOM,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: true,
    });
    this.faceTransitions.set(`${FACE_RIGHT}_${EDGE_FRONT}`, {
      targetFace: FACE_FRONT,
      rotation: 0,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_RIGHT}_${EDGE_BACK}`, {
      targetFace: FACE_BACK,
      rotation: 0,
      flipU: true,
      flipV: false,
    });

    // Left face (-X) transitions
    this.faceTransitions.set(`${FACE_LEFT}_${EDGE_TOP}`, {
      targetFace: FACE_TOP,
      rotation: Math.PI / 2,
      flipU: true,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_LEFT}_${EDGE_BOTTOM}`, {
      targetFace: FACE_BOTTOM,
      rotation: -Math.PI / 2,
      flipU: true,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_LEFT}_${EDGE_FRONT}`, {
      targetFace: FACE_FRONT,
      rotation: 0,
      flipU: true,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_LEFT}_${EDGE_BACK}`, {
      targetFace: FACE_BACK,
      rotation: 0,
      flipU: false,
      flipV: false,
    });

    // Top face (+Y) transitions
    this.faceTransitions.set(`${FACE_TOP}_${EDGE_FRONT}`, {
      targetFace: FACE_FRONT,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_TOP}_${EDGE_BACK}`, {
      targetFace: FACE_BACK,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: true,
    });
    this.faceTransitions.set(`${FACE_TOP}_${EDGE_LEFT}`, {
      targetFace: FACE_LEFT,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: true,
    });
    this.faceTransitions.set(`${FACE_TOP}_${EDGE_RIGHT}`, {
      targetFace: FACE_RIGHT,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: false,
    });

    // Bottom face (-Y) transitions
    this.faceTransitions.set(`${FACE_BOTTOM}_${EDGE_FRONT}`, {
      targetFace: FACE_FRONT,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: true,
    });
    this.faceTransitions.set(`${FACE_BOTTOM}_${EDGE_BACK}`, {
      targetFace: FACE_BACK,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_BOTTOM}_${EDGE_LEFT}`, {
      targetFace: FACE_LEFT,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_BOTTOM}_${EDGE_RIGHT}`, {
      targetFace: FACE_RIGHT,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: true,
    });

    // Front face (+Z) transitions
    this.faceTransitions.set(`${FACE_FRONT}_${EDGE_TOP}`, {
      targetFace: FACE_TOP,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_FRONT}_${EDGE_BOTTOM}`, {
      targetFace: FACE_BOTTOM,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_FRONT}_${EDGE_LEFT}`, {
      targetFace: FACE_LEFT,
      rotation: 0,
      flipU: false,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_FRONT}_${EDGE_RIGHT}`, {
      targetFace: FACE_RIGHT,
      rotation: 0,
      flipU: false,
      flipV: false,
    });

    // Back face (-Z) transitions
    this.faceTransitions.set(`${FACE_BACK}_${EDGE_TOP}`, {
      targetFace: FACE_TOP,
      rotation: Math.PI / 2,
      flipU: false,
      flipV: true,
    });
    this.faceTransitions.set(`${FACE_BACK}_${EDGE_BOTTOM}`, {
      targetFace: FACE_BOTTOM,
      rotation: -Math.PI / 2,
      flipU: false,
      flipV: true,
    });
    this.faceTransitions.set(`${FACE_BACK}_${EDGE_LEFT}`, {
      targetFace: FACE_LEFT,
      rotation: 0,
      flipU: true,
      flipV: false,
    });
    this.faceTransitions.set(`${FACE_BACK}_${EDGE_RIGHT}`, {
      targetFace: FACE_RIGHT,
      rotation: 0,
      flipU: true,
      flipV: false,
    });
  }
  insert(point: THREE.Vector3): void {
    // Check if point is within valid range using comparatorValue
    // const distanceFromOrigin = point.distanceTo(this.origin);
    // if (distanceFromOrigin > this.size * this.comparatorValue) {
    //   return; // Point is too far from cube, ignore it
    // }

    // const faceIndex = this.getFaceIndexForPoint(point);

    // // Validate the point is within the size bounds of our cube
    // const maxDistance = this.size * Math.sqrt(3); // Maximum possible distance to cube corner
    // if (distanceFromOrigin > maxDistance) {
    //   return; // Point is outside the cube's bounds
    // }

    for (let face of this.faces) {
      face.insert(point);
    }
  }

  private getFaceIndexForPoint(point: THREE.Vector3): number {
    // Get normalized direction from origin to point
    this._tempVec3A.copy(point).sub(this.origin).normalize();

    // Find the dominant axis
    const absX = Math.abs(this._tempVec3A.x);
    const absY = Math.abs(this._tempVec3A.y);
    const absZ = Math.abs(this._tempVec3A.z);

    if (absX > absY && absX > absZ) {
      return this._tempVec3A.x > 0 ? FACE_RIGHT : FACE_LEFT;
    } else if (absY > absX && absY > absZ) {
      return this._tempVec3A.y > 0 ? FACE_TOP : FACE_BOTTOM;
    } else {
      return this._tempVec3A.z > 0 ? FACE_FRONT : FACE_BACK;
    }
  }

  findCrossFaceNeighbor(
    faceIndex: number,
    nodeIndex: number,
    edge: number
  ): {
    face: number;
    node: number;
  } {
    const quadtree = this.faces[faceIndex];
    const nodeCenter = quadtree.nodeBuffer.getCenter(
      nodeIndex,
      this._tempVec3A
    );
    const nodeSize = quadtree.nodeBuffer.getSize(nodeIndex, this._tempVec3B);

    // Check if the node is too small to have cross-face neighbors
    if (nodeSize.x < this.minNodeSize) {
      return { face: -1, node: -1 };
    }

    // Check if the node is within valid distance for neighbor connection
    const worldCenter = nodeCenter
      .clone()
      .applyMatrix4(this.faceMatrices[faceIndex]);
    const distanceFromOrigin = worldCenter.distanceTo(this.origin);

    // Use comparatorValue to determine if the node should connect across faces
    if (distanceFromOrigin > this.size * this.comparatorValue) {
      return { face: -1, node: -1 };
    }

    // Transform position to world space
    nodeCenter.applyMatrix4(this.faceMatrices[faceIndex]);

    // Get transition information
    const transition = this.faceTransitions.get(`${faceIndex}_${edge}`);
    if (!transition) return { face: -1, node: -1 };

    // Transform the position to the neighbor face's coordinate system
    const targetPos = this.transformPositionAcrossFaces(
      nodeCenter,
      faceIndex,
      transition.targetFace,
      transition
    );

    // Find the corresponding node in the target face
    const neighborNode = this.findNodeAtPosition(
      this.faces[transition.targetFace],
      targetPos,
      nodeSize.x
    );

    return {
      face: transition.targetFace,
      node: neighborNode,
    };
  }

  private transformPositionAcrossFaces(
    worldPos: THREE.Vector3,
    sourceFace: number,
    targetFace: number,
    transition: FaceTransition
  ): THREE.Vector3 {
    // Create inverse matrix for target face
    const inverseTargetMatrix = this._tempMatrix4
      .copy(this.faceMatrices[targetFace])
      .invert();

    // Transform point from world space to target face space
    const localPos = this._tempVec3B
      .copy(worldPos)
      .applyMatrix4(inverseTargetMatrix);

    // Apply rotation and flips based on transition
    if (transition.rotation !== 0) {
      this._tempQuat.setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        transition.rotation
      );
      localPos.applyQuaternion(this._tempQuat);
    }

    if (transition.flipU) localPos.x *= -1;
    if (transition.flipV) localPos.y *= -1;

    return localPos;
  }

  private findNodeAtPosition(
    quadtree: QuadTree,
    position: THREE.Vector3,
    targetSize: number
  ): number {
    let currentNode = 0; // Start at root

    const _tempVec3A = this._tempVec3A;
    const _tempVec3B = this._tempVec3B;
    const minNodeSize = this.minNodeSize;
    const getQuadrant = this.getQuadrant;
    while (true) {
      const nodeSize = quadtree.nodeBuffer.getSize(currentNode, _tempVec3A);

      // If we've found a node of similar size, return it
      if (Math.abs(nodeSize.x - targetSize) < minNodeSize) {
        return currentNode;
      }

      const childCount = quadtree.nodeBuffer.getChildCount(currentNode);
      if (childCount === 0) break;

      // Find the appropriate child quadrant
      const center = quadtree.nodeBuffer.getCenter(currentNode, _tempVec3B);
      const quadrant = getQuadrant(position, center);

      if (quadrant === -1) break;

      currentNode = quadtree.nodeBuffer.getChildIndex(currentNode, quadrant);
    }

    return currentNode;
  }

  private getQuadrant(position: THREE.Vector3, center: THREE.Vector3): number {
    const isRight = position.x > center.x;
    const isTop = position.y > center.y;

    if (!isRight && !isTop) return 0; // Bottom left
    if (isRight && !isTop) return 1; // Bottom right
    if (!isRight && isTop) return 2; // Top left
    if (isRight && isTop) return 3; // Top right
    return -1;
  }

  getFaces(): QuadTree[] {
    return this.faces;
  }

  getFace(index: number): QuadTree {
    if (index < 0 || index >= 6) {
      throw new Error("Invalid face index");
    }
    return this.faces[index];
  }

  getDebugInfo(): { faceIndex: number; nodeCount: number }[] {
    return this.faces.map((face, index) => ({
      faceIndex: index,
      nodeCount: face.nodeBuffer.size,
    }));
  }

  reset() {
    for (let face of this.faces) {
      face.reset();
    }
  }

  findClosestNode(point: THREE.Vector3): {
    faceIndex: number;
    nodeIndex: number;
    absoluteNodeIndex: number;
    incrementalNodeIndex: number;
    distance: number;
    nodeInfo: {
      center: THREE.Vector3;
      size: THREE.Vector3;
      bounds: THREE.Box3;
      childCount: number;
      level: number;
    };
  } {
    let closestFaceIndex = 0;
    let closestNodeIndex = 0;
    let closestDistance = Infinity;
    let closestNodeInfo = null;

    // Check each face
    this.faces.forEach((face, faceIndex) => {
      // Transform point to face's local space
      const localPoint = point.clone();
      const inverseMatrix = this._tempMatrix4
        .copy(this.faceMatrices[faceIndex])
        .invert();
      localPoint.applyMatrix4(inverseMatrix);

      // Find closest node in this face
      const { nodeIndex, distance } = face.findClosestNode(localPoint);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestFaceIndex = faceIndex;
        closestNodeIndex = nodeIndex;
        closestNodeInfo = face.getNodeInfo(nodeIndex);
      }
    });

    return {
      faceIndex: closestFaceIndex,
      nodeIndex: closestNodeIndex,
      absoluteNodeIndex:
        this.faces[closestFaceIndex].nodeBuffer.getNodeAbsoluteIndex(
          closestNodeIndex
        ),
      incrementalNodeIndex: this.getAbsoluteIndex(
        closestFaceIndex,
        closestNodeIndex
      ),
      distance: closestDistance,
      nodeInfo: closestNodeInfo,
    };
  }

  getAbsoluteIndex(faceIndex: number, nodeIndex: number): number {
    if (faceIndex < 0 || faceIndex >= 6) {
      throw new Error("Invalid face index");
    }

    let absoluteIndex = 0;

    // // Add up all nodes in previous faces
    for (let i = 0; i < faceIndex; i++) {
      absoluteIndex += this.faces[i].nodeBuffer.size;
    }

    // Add the node index within the current face
    return absoluteIndex + nodeIndex;
  }

  // Optional: Add reverse lookup
  getRelativeIndices(absoluteIndex: number): {
    faceIndex: number;
    nodeIndex: number;
  } {
    let remainingIndex = absoluteIndex;

    for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
      const faceSize = this.faces[faceIndex].nodeBuffer.size;
      if (remainingIndex < faceSize) {
        return { faceIndex, nodeIndex: remainingIndex };
      }
      remainingIndex -= faceSize;
    }

    throw new Error("Invalid absolute index");
  }
}
