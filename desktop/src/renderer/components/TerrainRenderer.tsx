import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
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
  maxDepth = 6,
}: TerrainRendererProps) {
  const quadtreeRef = useRef<CubeSphereQuadtree>(new CubeSphereQuadtree());
  const instancerRef = useRef<TerrainInstancer>(null);
  const axesHelperRef = useRef<THREE.AxesHelper>(null);
  const scene = useThree((state) => state.scene);

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
    scene.add(instancerRef.current.mesh);

    axesHelperRef.current = new THREE.AxesHelper(radius);
    axesHelperRef.current.position.copy(position);

    return () => {
      console.log("Disposing terrain");
      instancerRef.current?.dispose();
      axesHelperRef.current?.dispose();
    };
  }, [radius, position]);

  useFrame(({ camera }) => {
    if (!instancerRef.current || !quadtreeRef.current) return;

    quadtreeRef.current.maxDepth = maxDepth;
    quadtreeRef.current.updateLOD(camera.position, radius, position);
    instancerRef.current.update();

    const debugDiv = document.getElementById("debug-thingy");
    if (debugDiv) {
      debugDiv.innerHTML = `
        <p>Visible Nodes: ${quadtreeRef.current.getVisibleNodes().length}</p>
        <p>Max Depth: ${maxDepth}</p>
      `;
    }
  });

  // Optional: Update instancer without recreation
  useEffect(() => {
    if (instancerRef.current) {
      instancerRef.current.setRadius(radius);
      instancerRef.current.setPosition(position);
    }
    if (axesHelperRef.current) {
      axesHelperRef.current.scale.setScalar(radius);
      axesHelperRef.current.position.copy(position);
    }
  }, [radius, position]);

  return (
    <>
      <Html>
        <div id="debug-thingy"></div>
      </Html>
    </>
  );
}
