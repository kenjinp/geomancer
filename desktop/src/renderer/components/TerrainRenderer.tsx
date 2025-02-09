import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { CubeSphereQuadtree } from "../terrain/CubeSphereQuadtree";
import { TerrainInstancer } from "../terrain/TerrainInstancer";

interface TerrainRendererProps {
  radius?: number;
  position?: THREE.Vector3;
  maxDepth?: number;
}

export function TerrainRenderer({
  radius = 1,
  position = new THREE.Vector3(),
  maxDepth = 8,
}: TerrainRendererProps) {
  const quadtreeRef = useRef<CubeSphereQuadtree>(new CubeSphereQuadtree());
  const instancerRef = useRef<TerrainInstancer>(null);

  useEffect(() => {
    console.log("Initializing terrain with:", {
      radius,
      position,
      nodes: quadtreeRef.current
        .getVisibleNodes()
        .map((n) => quadtreeRef.current.getNodeView(n).toObject()),
    });

    instancerRef.current = new TerrainInstancer(quadtreeRef.current, {
      radius,
      position,
    });

    return () => {
      console.log("Disposing terrain");
      instancerRef.current?.dispose();
    };
  }, [radius, position]);

  useFrame(({ camera }) => {
    if (!instancerRef.current || !quadtreeRef.current) return;

    quadtreeRef.current.maxDepth = maxDepth;
    quadtreeRef.current.updateLOD(camera.position);
    instancerRef.current.update();
  });

  // Optional: Update instancer without recreation
  useEffect(() => {
    if (instancerRef.current) {
      instancerRef.current.setRadius(radius);
      instancerRef.current.setPosition(position);
    }
  }, [radius, position]);

  return instancerRef.current ? (
    <primitive object={instancerRef.current.mesh} />
  ) : null;
}
