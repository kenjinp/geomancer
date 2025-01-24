import { ThreeEvent, useFrame } from "@react-three/fiber";
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
  const [nodeIndex, setNodeIndex] = useState(-1);

  const handleDebugHover = (e: ThreeEvent<PointerEvent>) => {
    let point = e.point;
    const element = document.getElementById("node-debug");
    const closestNode = quadtree.findClosestNode(point);
    setNodeIndex(closestNode.incrementalNodeIndex);
    element.innerText = `
      faceIndex: ${closestNode.faceIndex}
      distance: ${closestNode.distance.toFixed(2)}
      nodeIndex: ${closestNode.nodeIndex}
      absoluteNodeIndex: ${closestNode.absoluteNodeIndex}
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
    renderer.update(nodeIndex);

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
    rendererRef.current.update(nodeIndex);
  });

  return (
    <>
      <mesh
        // visible={false}
        onPointerMove={handleDebugHover}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => {
          setHover(false);
          setNodeIndex(-1);
        }}
      >
        <boxGeometry args={[2048 * 2, 2048 * 2, 2048 * 2]} />
        {/* <sphereGeometry args={[2048, 32, 32]} /> */}
        <meshBasicMaterial wireframe />
      </mesh>

      <group ref={groupRef} name="QuadThree" />
    </>
  );
};
