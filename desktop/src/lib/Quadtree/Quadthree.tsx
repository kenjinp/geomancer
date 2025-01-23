import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
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
  const [hover, setHover] = useState(false);
  const [faceIndex, setFaceIndex] = useState(-1);

  const scene = useThree((s) => s.scene);

  const handleDebugHover = (e: ThreeEvent<PointerEvent>) => {
    let point = e.point;
    const element = document.getElementById("node-debug");
    const closestNode = quadtree.findClosestNode(point);
    setFaceIndex(closestNode.faceIndex);
    element.innerText = `
      faceIndex: ${closestNode.faceIndex}\n
      distance: ${closestNode.distance.toFixed(2)}\n
      nodeIndex: ${closestNode.nodeIndex}\n
      level: ${closestNode.nodeInfo.level}`;
  };

  // Initialize renderer and handle cleanup
  useEffect(() => {
    // Create new renderer instance
    const renderer = new QuadtreeRenderer(quadtree);
    rendererRef.current = renderer;

    // Set initial properties
    renderer.setWireframe(wireframe);
    renderer.setOpacity(opacity);

    // Add meshes to our group
    const mesh = renderer.getMesh();
    groupRef.current.add(mesh);

    // Initial update
    renderer.update(faceIndex);

    // Cleanup
    return () => {
      groupRef.current.remove(renderer.getMesh());
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
    if (!rendererRef.current) {
      return;
    }
    rendererRef.current.update(faceIndex);
  });

  return (
    <>
      <mesh
        visible={false}
        onPointerMove={handleDebugHover}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => {
          setHover(false);
          setFaceIndex(-1);
        }}
      >
        <sphereGeometry args={[2048, 32, 32]} />
        <meshBasicMaterial wireframe />
      </mesh>

      <group ref={groupRef} name="QuadThree" />
    </>
  );
};
