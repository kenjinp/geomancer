import { Html } from "@react-three/drei";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CubeSphereQuadtree } from "../terrain/CubeSphereQuadtree";
import { TerrainInstancer } from "../terrain/TerrainInstancer";

interface TerrainRendererProps {
  radius?: number;
  position?: THREE.Vector3;
  maxDepth?: number;
}

const makeHumanReadableMeters = (meters: number) => {
  if (meters > 1000) {
    return `${(meters / 1000).toLocaleString()} km`;
  }
  return `${meters.toLocaleString()} m`;
};

export function TerrainRenderer({
  radius = 1,
  position = new THREE.Vector3(),
  maxDepth = 20,
}: TerrainRendererProps) {
  const quadtreeRef = useRef<CubeSphereQuadtree>(new CubeSphereQuadtree());
  const instancerRef = useRef<TerrainInstancer>(null);
  const axesHelperRef = useRef<THREE.AxesHelper>(null);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const sphereWorldPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const [hovering, setHovering] = useState(false);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);

  console.log({
    hoveredNodeIndex,
    hoveredNode: quadtreeRef.current?.getNodeView(hoveredNodeIndex)?.toObject(),
    hoverPosition: sphereWorldPosition.current,
  });

  const positionKey = position.toArray().join(",");

  useEffect(() => {
    let stale = false;
    console.log("Initializing terrain with:", {
      radius,
      position,
      nodes: quadtreeRef.current
        .getVisibleNodes(camera, radius, position)
        .map((n) => quadtreeRef.current.getNodeView(n).toObject()),
    });

    instancerRef.current = new TerrainInstancer(quadtreeRef.current, {
      radius,
      position,
    });

    instancerRef.current.initialize().then(() => {
      if (!stale) {
        scene.add(instancerRef.current.mesh);
      }
    });

    return () => {
      stale = true;
      console.log("Disposing terrain");
      instancerRef.current?.dispose();
      scene.remove(instancerRef.current?.mesh);
    };
  }, [radius, positionKey, camera]);

  useFrame(({ camera }) => {
    if (!instancerRef.current || !quadtreeRef.current) return;

    quadtreeRef.current.maxDepth = maxDepth;
    quadtreeRef.current.updateLOD(camera.position, radius, position);
    instancerRef.current.update(camera, hoveredNodeIndex);

    const debugDiv = document.getElementById("debug-thingy");
    if (debugDiv) {
      debugDiv.innerHTML = `
      <div width="400">
        <p>Max Depth: ${maxDepth}</p>
        <br/>
        <p>Current Depth: ${quadtreeRef.current.getCurrentDepth()}</p>
        <br/>
        <p>Node Size: ${makeHumanReadableMeters(
          quadtreeRef.current.estimateNodeSize(radius)
        )}</p>
      </div>
        `;
    }
  });

  // Optional: Update instancer without recreation
  useEffect(() => {
    if (instancerRef.current.mesh) {
      instancerRef.current.setRadius(radius, camera);
      instancerRef.current.setPosition(position);
    }
    if (axesHelperRef.current) {
      axesHelperRef.current.scale.setScalar(radius);
      axesHelperRef.current.position.copy(position);
    }
  }, [radius, position, camera]);

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    // TODO add back in
    // sphereWorldPosition.current.copy(event.point);
    // const nodeIndex = quadtreeRef.current.findNodeAtPosition(
    //   event.point,
    //   radius,
    //   position,
    //   true
    // );
    // setHoveredNodeIndex(nodeIndex);
  };

  const handlePointerLeave = () => {
    setHovering(true);
  };

  const handlePointerEnter = () => {
    setHovering(true);
  };

  return (
    <>
      <Html>
        <div id="debug-thingy"></div>
      </Html>
      <mesh
        visible={false}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerEnter={handlePointerEnter}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial color="red" />
      </mesh>
    </>
  );
}
