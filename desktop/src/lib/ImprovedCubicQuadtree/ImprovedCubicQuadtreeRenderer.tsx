import { useEffect, useMemo, useRef } from "react";
import {
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { ImprovedCubicQuadtree } from "./ImprovedCubicQuadtree";
import { CubeFace } from "./types";

interface ImprovedCubicQuadtreeRendererProps {
  quadtree: ImprovedCubicQuadtree;
  color?: string;
  wireframe?: boolean;
}

export function ImprovedCubicQuadtreeRenderer({
  quadtree,
  color = "#00ff00",
  wireframe = true,
}: ImprovedCubicQuadtreeRendererProps) {
  const meshRef = useRef<InstancedMesh>(null);

  // Create a single geometry for all instances
  const geometry = useMemo(() => {
    const geo = new PlaneGeometry(1, 1);
    return geo;
  }, []);

  // Create material
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color,
        wireframe,
        side: DoubleSide,
        transparent: true,
        opacity: 0.5,
      }),
    [color, wireframe]
  );

  // Update instance matrices whenever the quadtree changes
  useEffect(() => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;
    const matrix = new Matrix4();
    const position = new Vector3();
    const scale = new Vector3();
    let instanceCount = 0;

    // Helper to process nodes for a single face
    const processNodesForFace = (face: CubeFace) => {
      const buffer = quadtree.getBuffer();
      const nodeCount = buffer.getNodeCount();

      for (let i = 0; i < nodeCount; i++) {
        if (buffer.getFaceIndex(i) !== face) continue;

        // Get node properties
        const x = buffer.getX(i);
        const y = buffer.getY(i);
        const size = buffer.getSize(i);

        // Convert face coordinates to world position
        const worldPos = quadtree.faceToWorldCoordinates(face, x, y);
        position.copy(worldPos);

        // Calculate scale based on node size and radius
        const scaleFactor = size * quadtree.getRadius() * 2;
        scale.set(scaleFactor, scaleFactor, scaleFactor);

        // Create transformation matrix
        matrix.compose(
          position,
          quadtree.getFaceRotation(face), // Get quaternion for face orientation
          scale
        );

        // Update instance matrix
        mesh.setMatrixAt(instanceCount, matrix);
        instanceCount++;
      }
    };

    // Process all faces
    Object.values(CubeFace).forEach((face) => {
      if (typeof face === "number") {
        processNodesForFace(face);
      }
    });

    mesh.instanceMatrix.needsUpdate = true;
    mesh.count = instanceCount;
  }, [quadtree]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, quadtree.getBuffer().getMaxNodes()]}
    />
  );
}
