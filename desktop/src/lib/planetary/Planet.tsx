import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { PlanetaryQuadtree } from "./QuadtreeSystem";
import { TerrainInstancer } from "./TerrainInstancer";

export function Planet({ radius = 1 }) {
  const instancer = useRef<TerrainInstancer>(null);
  const { scene, camera } = useThree();

  useEffect(() => {
    const quadtree = new PlanetaryQuadtree(radius);

    instancer.current = new TerrainInstancer(quadtree, radius);
    scene.add(instancer.current.mesh);

    return () => {
      if (instancer.current) {
        scene.remove(instancer.current.mesh);
        instancer.current.mesh.geometry.dispose();
        instancer.current.mesh.material.dispose();
      }
    };
  }, []);

  useFrame(() => {
    instancer.current?.update(camera);

    const debugDiv = document.getElementById("new-quadtree-debug");
    if (debugDiv) {
      debugDiv.innerHTML = `
        <p>Active Nodes: ${instancer.current?.quadtree.activeNodeCount}</p>
      `;
    }
  });

  return (
    <>
      <Html>
        <div id="new-quadtree-debug"></div>
      </Html>
    </>
  );
}
