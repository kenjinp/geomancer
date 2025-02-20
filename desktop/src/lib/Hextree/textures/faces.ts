// precompute-icosahedron.ts
import { Matrix3, Vector3 } from "three";

// Icosahedron vertices using golden ratio (φ = (1+√5)/2)
const PHI = (1 + Math.sqrt(5)) / 2;
const ICOSA_VERTICES = [
  // X-Y plane vertices
  new Vector3(-1, PHI, 0), // 0
  new Vector3(1, PHI, 0), // 1
  new Vector3(-1, -PHI, 0), // 2
  new Vector3(1, -PHI, 0), // 3

  // Y-Z plane vertices
  new Vector3(0, -1, PHI), // 4
  new Vector3(0, 1, PHI), // 5
  new Vector3(0, -1, -PHI), // 6
  new Vector3(0, 1, -PHI), // 7

  // X-Z plane vertices
  new Vector3(PHI, 0, -1), // 8
  new Vector3(PHI, 0, 1), // 9
  new Vector3(-PHI, 0, -1), // 10
  new Vector3(-PHI, 0, 1), // 11
].map((v) => v.normalize());

// Icosahedron face vertex indices (20 faces)
const icosaFaces = [
  // 5 faces around vertex 0
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],

  // 5 adjacent faces
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],

  // 5 faces around vertex 3
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],

  // 5 adjacent faces
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

export function generateFaceData() {
  const faces = [];

  // Create 20 triangular faces from vertices
  for (let i = 0; i < 20; i++) {
    const face = {
      normal: new Vector3(),
      transform: new Matrix3(),
      vertices: [] as Vector3[],
    };

    // Calculate face normal (using face vertices)
    const v1 = ICOSA_VERTICES[icosaFaces[i][0]];
    const v2 = ICOSA_VERTICES[icosaFaces[i][1]];
    const v3 = ICOSA_VERTICES[icosaFaces[i][2]];
    face.normal
      .crossVectors(v2.clone().sub(v1), v3.clone().sub(v1))
      .normalize();

    // Create local coordinate system
    const axisX = v2.clone().sub(v1).normalize();
    const axisY = face.normal.clone().cross(axisX);
    face.transform
      .set(
        axisX.x,
        axisY.x,
        face.normal.x,
        axisX.y,
        axisY.y,
        face.normal.y,
        axisX.z,
        axisY.z,
        face.normal.z
      )
      .invert();

    faces.push(face);
  }

  return faces;
}
