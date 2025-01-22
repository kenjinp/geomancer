import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Group } from "three";
import { CubicQuadtree } from "./CubicQuadtree";
import { QuadtreeRenderer } from "./QuadtreeRenderer";

// Interface for the props
interface QuadtreeVisualizerProps {
  quadtree: CubicQuadtree;
  wireframe?: boolean;
  opacity?: number;
  autoRotate?: boolean;
}

// Main component for visualizing the quadtree
export const QuadtreeVisualizer: React.FC<QuadtreeVisualizerProps> = ({
  quadtree,
  wireframe = true,
  opacity = 1,
}) => {
  // Reference to our QuadtreeRenderer instance
  const rendererRef = useRef<QuadtreeRenderer | null>(null);
  const groupRef = useRef<Group>(null);

  const scene = useThree((s) => s.scene);

  // Initialize renderer and handle cleanup
  useEffect(() => {
    // Create new renderer instance
    const renderer = new QuadtreeRenderer(quadtree);
    rendererRef.current = renderer;

    // Set initial properties
    renderer.setWireframe(wireframe);
    renderer.setOpacity(opacity);

    // Add meshes to our group
    const meshes = renderer.getMeshes();
    meshes.forEach((mesh) => {
      if (groupRef.current) {
        groupRef.current.add(mesh);
      }
    });
    // Initial update
    renderer.update();

    // Cleanup
    return () => {
      meshes.forEach((mesh) => {
        if (groupRef.current) {
          groupRef.current.remove(mesh);
        }
      });
      renderer.dispose();
    };
  }, [quadtree]); // Only recreate if quadtree changes

  // Update renderer properties when they change
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setWireframe(wireframe);
    }
  }, [wireframe]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  useFrame(() => {
    rendererRef.current.update();
  });

  return (
    <>
      <group ref={groupRef} name="QuadThree" />
    </>
  );
};
