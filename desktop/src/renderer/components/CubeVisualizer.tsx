import { Stats, Text } from "@react-three/drei";
import React, { useMemo } from "react";
import * as THREE from "three";

import {
  CubeFace,
  CubicCoordinates,
} from "../../lib/coordinate-systems/cube-projection/CubicCoordinates";

const faceNames: { [face: number]: string } = {
  0: "Front +Z",
  1: "Back -Z",
  2: "Right +X",
  3: "Left -X",
  4: "Top +Y",
  5: "Bottom -Y",
};

const faceColors: { [face: number]: string } = {
  0: "red",
  1: "green",
  2: "blue",
  3: "orange",
  4: "cyan",
  5: "magenta",
};

type CubeFaceMeshProps = {
  face: number;
};

const CubeFaceMesh: React.FC<CubeFaceMeshProps> = ({ face }) => {
  // Build a quad (plane) using the four corners computed from CubicCoordinates.
  // We use the UV coordinates (0,0), (1,0), (1,1) and (0,1)
  const geometry = useMemo(() => {
    const vertices: number[] = [];
    // Define the UV corners in order: lower-left, lower-right, upper-right, upper-left.
    const uvCorners: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];

    uvCorners.forEach(([u, v]) => {
      // Compute the coordinates using CubicCoordinates helper
      const coords = CubicCoordinates.fromUV(face, u, v);
      const pos = coords.toVector3();
      vertices.push(pos.x, pos.y, pos.z);
    });

    // Specify two triangles to make a quad (using zero-based indices)
    const indices = [0, 1, 2, 0, 2, 3];

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [face]);

  // Compute the center of the face using UV = (0.5, 0.5)
  const center = useMemo(() => {
    const coords = CubicCoordinates.fromUV(face, 0.5, 0.5);
    return coords.toVector3();
  }, [face]);

  // Compute the face normal (for these faces, center is along the face normal)
  // Then offset the text by a small amount and compute a rotation
  const { textPosition, textQuaternion } = useMemo(() => {
    // The center (for u=0.5, v=0.5) is exactly on the cube face.
    // Its normalized version provides the face normal.
    const normal = center.clone().normalize();
    // Adjust this value to offset the text further from the face if desired.
    const offsetDistance = 0.15;
    const textPosition = center.clone().add(normal.clone().multiplyScalar(offsetDistance));

    // The default Text front is assumed to be along +Z.
    // Compute a quaternion to rotate from +Z to the computed face normal.
    const defaultFront = new THREE.Vector3(0, 0, 1);
    const textQuaternion = new THREE.Quaternion().setFromUnitVectors(defaultFront, normal);

    return { textPosition, textQuaternion };
  }, [center]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        color={faceColors[face]}
        side={THREE.DoubleSide}
        // Uncomment to enable wireframe view:
        // wireframe={true}
      />
      {/* Add a label at the center of the face, offset and rotated to follow the face normal */}
      <Text
        position={[textPosition.x, textPosition.y, textPosition.z]}
        quaternion={textQuaternion}
        fontSize={0.2}
        color="black"
        anchorX="center"
        anchorY="middle"
      >
        {faceNames[face]} ({CubeFace[face]})
      </Text>
    </mesh>
  );
};

export default function CubeVisualizer({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <Stats />
      {/* Render the six cube faces */}
      <axesHelper args={[scale * 2]} />
      <group>
        <CubeFaceMesh face={0} />
        <CubeFaceMesh face={1} />
        <CubeFaceMesh face={2} />
        <CubeFaceMesh face={3} />
        <CubeFaceMesh face={4} />
        <CubeFaceMesh face={5} />
      </group>
    </group>
  );
}
