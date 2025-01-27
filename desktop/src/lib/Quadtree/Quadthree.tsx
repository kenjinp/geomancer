import { useQuadtree } from "@/renderer/providers/QuadtreeProvider";
import { ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Group } from "three";
import useSound from "use-sound";
import { QuadtreeRenderer } from "./QuadtreeRenderer";
import { NODE_INT_COUNT, NodeIntIndex } from "./constants";

// Interface for the props
interface QuadtreeVisualizerProps {
  wireframe?: boolean;
  opacity?: number;
  autoRotate?: boolean;
}

// Main component for visualizing the quadtree
export const QuadtreeVisualizer: React.FC<QuadtreeVisualizerProps> = ({
  wireframe = true,
  opacity = 1,
}) => {
  const { quadtree } = useQuadtree();
  const [play, { sound }] = useSound("/sound/small-click.mp3");
  const [playBig, { sound: soundBig }] = useSound("/sound/big-click.mp3");
  // Reference to our QuadtreeRenderer instance
  const rendererRef = useRef<QuadtreeRenderer | null>(null);
  const groupRef = useRef<Group>(null);
  const [hover, setHover] = useState(false);
  const [nodeIndex, setNodeIndex] = useState({
    incrementalNodeIndex: -1,
    faceIndex: -1,
  });

  const handleDebugHover = (e: ThreeEvent<PointerEvent>) => {
    let point = e.point;
    const element = document.getElementById("node-debug");
    const closestNode = quadtree.findClosestNode(point);
    setNodeIndex({
      incrementalNodeIndex: closestNode.incrementalNodeIndex,
      faceIndex: closestNode.faceIndex,
    });

    const nodeBuffer = quadtree.getCompactedIntBuffer();
    const selectedNodeChildIndices = [
      ...nodeBuffer.slice(
        closestNode.incrementalNodeIndex * NODE_INT_COUNT +
          NodeIntIndex.CHILD_BOTTOM_LEFT,
        closestNode.incrementalNodeIndex * NODE_INT_COUNT +
          NodeIntIndex.CHILD_TOP_RIGHT +
          1
      ),
    ];
    const selectedNodeNeighbors = [
      ...nodeBuffer.slice(
        closestNode.incrementalNodeIndex * NODE_INT_COUNT +
          NodeIntIndex.NEIGHBOR_LEFT,
        closestNode.incrementalNodeIndex * NODE_INT_COUNT +
          NodeIntIndex.NEIGHBOR_BOTTOM +
          1
      ),
    ];

    element.innerHTML = `
      <div class="bg-dark bg-opacity-75 p-4 rounded-lg shadow-lg text-sm">
        <div class="grid grid-cols-2 gap-2">
          <div class="text-blue-300">Face Index:</div>
          <div class="text-white">${closestNode.faceIndex}</div>
          
          <div class="text-blue-300">Distance:</div>
          <div class="text-white">${closestNode.distance.toFixed(2)}</div>
          
          <div class="text-blue-300">Node Index:</div>
          <div class="text-white">${closestNode.nodeIndex}</div>
          
          <div class="text-blue-300">Absolute Index:</div>
          <div class="text-white">${closestNode.absoluteNodeIndex}</div>

          <div class="text-blue-300">Incremental Index:</div>
          <div class="text-white">${closestNode.incrementalNodeIndex}</div>
          
          <div class="text-blue-300">Level:</div>
          <div class="text-white">${closestNode.nodeInfo.level}</div>

          <div class="text-blue-300">No children:</div>
          <div class="text-white">${closestNode.nodeInfo.childCount}</div>
          
          <div class="text-blue-300">Child Indices:</div>
          <div class="text-white font-mono">${selectedNodeChildIndices}</div>
          
          <div class="text-blue-300">Neighbors:</div>
          <div class="text-white font-mono">${selectedNodeNeighbors}</div>
          
          <div class="text-blue-300">Node Flags:</div>
          <div class="text-white">
            <span class="${
              closestNode.nodeInfo.isRoot ? "text-green-400" : "text-gray-500"
            }">Root</span> |
            <span class="${
              closestNode.nodeInfo.isLeaf ? "text-green-400" : "text-gray-500"
            }">Leaf</span> |
            <span class="${
              closestNode.nodeInfo.isSplit ? "text-green-400" : "text-gray-500"
            }">Split</span> |
            <span class="${
              closestNode.nodeInfo.isBoundary
                ? "text-green-400"
                : "text-gray-500"
            }">Boundary</span>
          </div>
        </div>
      </div>
    `;
  };

  useEffect(() => {
    if (nodeIndex.incrementalNodeIndex >= 0 && sound && play) {
      const playbackFudgeRate = nodeIndex.faceIndex * 0.1;
      sound.stop();
      play({
        playbackRate: 0.6 + Math.random() * playbackFudgeRate,
      });
    }
  }, [nodeIndex.incrementalNodeIndex]);

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
    renderer.update(nodeIndex.incrementalNodeIndex);

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
    rendererRef.current.update(nodeIndex.incrementalNodeIndex);
  });

  const handleNodeClick = () => {
    if (nodeIndex.incrementalNodeIndex < 0) return;
    const node = quadtree.getNodeInfoFromIncrementalIndex(
      nodeIndex.incrementalNodeIndex
    );
    window.moveToTarget(node.sphereCenter);
    playBig();
  };

  return (
    <>
      <mesh
        visible={false}
        onClick={handleNodeClick}
        onPointerMove={handleDebugHover}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => {
          setHover(false);
          setNodeIndex({
            incrementalNodeIndex: -1,
            faceIndex: -1,
          });
        }}
      >
        {/* <boxGeometry args={[2048 * 2, 2048 * 2, 2048 * 2]} /> */}
        <sphereGeometry args={[2048, 32, 32]} />
        <meshBasicMaterial wireframe />
      </mesh>

      <group ref={groupRef} name="QuadThree" />
    </>
  );
};
