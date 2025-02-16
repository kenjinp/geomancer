import { Html, useTexture } from "@react-three/drei";
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
  const uvTexture = useTexture("/img/UV.png");
  const quadtreeRef = useRef<CubeSphereQuadtree>(new CubeSphereQuadtree());
  const instancerRef = useRef<TerrainInstancer>(null);
  const axesHelperRef = useRef<THREE.AxesHelper>(null);
  const scene = useThree((state) => state.scene);
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
      scene.remove(instancerRef.current?.mesh);
    };
  }, [radius, positionKey]);

  useEffect(() => {
    if (instancerRef.current) {
      (
        instancerRef.current.material as THREE.ShaderMaterial
      ).uniforms.map.value = uvTexture;
    }
  }, [uvTexture]);

  useFrame(({ camera }) => {
    if (!instancerRef.current || !quadtreeRef.current) return;

    quadtreeRef.current.maxDepth = maxDepth;
    quadtreeRef.current.updateLOD(camera.position, radius, position);
    instancerRef.current.update(hoveredNodeIndex);

    const debugDiv = document.getElementById("debug-thingy");
    if (debugDiv) {
      debugDiv.innerHTML = `
      <div width="400">

        <p>Visible Nodes: ${quadtreeRef.current.getVisibleNodes().length}</p>
        <br/>
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
    if (instancerRef.current) {
      instancerRef.current.setRadius(radius);
      instancerRef.current.setPosition(position);
    }
    if (axesHelperRef.current) {
      axesHelperRef.current.scale.setScalar(radius);
      axesHelperRef.current.position.copy(position);
    }
  }, [radius, position]);

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    sphereWorldPosition.current.copy(event.point);
    const nodeIndex = quadtreeRef.current.findNodeAtPosition(
      event.point,
      radius,
      position,
      true
    );
    setHoveredNodeIndex(nodeIndex);
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
      <axesHelper args={[radius * 4]} />
    </>
  );
}
