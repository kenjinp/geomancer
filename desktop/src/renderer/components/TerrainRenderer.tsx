import { HexGrid } from "@/lib/coordinate-systems/hex/HexGrid";
import { LatLong } from "@/lib/coordinate-systems/sphere/LatLong";
import { integerToRGB } from "@/lib/images/colorUtils";
import { getState } from "@/state/Context";
import { ShaderUtils } from "@/utils/three.utils";
import { remap } from "@hello-worlds/planets";
import { ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CubeSphereQuadtree } from "../terrain/CubeSphereQuadtree";
import { TerrainInstancer } from "../terrain/TerrainInstancer";
import { OrbitCamera } from "./OrbitCamera";

interface TerrainRendererProps {
  radius?: number;
  position?: THREE.Vector3;
  maxDepth?: number;
}

const makeHumanReadableMeters = (meters: number) => {
  if (Math.abs(meters) > 1000) {
    return `${(meters / 1000).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}km`;
  }
  return `${meters.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}m`;
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
  const renderer = useThree((state) => state.gl);
  const sphereWorldPosition = useRef<THREE.Vector3>(new THREE.Vector3());
  const [hovering, setHovering] = useState(false);
  const hoveredHexTileIndex = useRef(-1);

  const positionKey = position.toArray().join(",");

  useEffect(() => {
    if (!renderer) return;
    let stale = false;
    console.log("Initializing terrain with:", {
      radius,
      position,
      nodes: quadtreeRef.current
        .getVisibleNodes(camera, radius, position)
        .map((n) => quadtreeRef.current.getNodeView(n).toObject()),
    });

    instancerRef.current = new TerrainInstancer(quadtreeRef.current);

    instancerRef.current.initialize().then(() => {
      if (!stale) {
        scene.add(instancerRef.current.mesh);
        ShaderUtils.init(renderer, scene, camera, instancerRef.current.mesh);
      }
    });

    return () => {
      stale = true;
      console.log("Disposing terrain");
      instancerRef.current?.dispose();
      scene.remove(instancerRef.current?.mesh);
    };
  }, [radius, positionKey, camera, renderer]);

  useFrame(({ camera }) => {
    if (!instancerRef.current || !quadtreeRef.current) return;

    quadtreeRef.current.maxDepth = maxDepth;
    quadtreeRef.current.updateLOD(camera.position, radius, position);
    instancerRef.current.update(camera);
    instancerRef.current.setSelectedTile(hoveredHexTileIndex.current);

    const latLong = LatLong.cartesianToLatLong(
      sphereWorldPosition.current.normalize()
    );

    const mouseFollower = document.getElementById("mouse-follower");
    if (mouseFollower) {
      if (hoveredHexTileIndex.current && hoveredHexTileIndex.current < 0) {
        mouseFollower.innerHTML = null;
        return;
      }
      const state = getState();
      const hexTileBuffer = state.buffers.hexTileBuffer;
      const hexTileData = hexTileBuffer.readTileData(
        hoveredHexTileIndex.current
      );

      const hashColor = integerToRGB(hoveredHexTileIndex.current);
      const hashColorString = hashColor.join(",");
      const hashColorRGB = `rgb(${hashColorString})`;
      const elevation = makeHumanReadableMeters(
        remap(hexTileData.elevation, -1, 1, -8_000, 8_000)
      );
      mouseFollower.innerHTML = hovering
        ? `
      <div class="latlong text-small bg-background/20 p-2 rounded-md">
        <em style="color: ${hashColorRGB}">${hoveredHexTileIndex.current}</em>
        <em style="color: ${integerToRGB(hexTileData.tectonicPlate)}">p:${
            hexTileData.tectonicPlate
          }</em>
        <span>${elevation}</span>
        <span>i:${hexTileData.collisionIntensity}</span>
        <span>${latLong.lat.toFixed(2)}° lat</span>,
        <span>${latLong.lon.toFixed(2)}° lon</span> 
      </div> 
        `
        : null;
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
    sphereWorldPosition.current.copy(event.point);
    const index = HexGrid.getIndexFromPosition(event.point.normalize(), 4);
    hoveredHexTileIndex.current = index;
    // instancerRef.current.setSelectedTile(index);
  };

  const handlePointerLeave = () => {
    hoveredHexTileIndex.current = -1;
    setHovering(false);
  };

  const handlePointerEnter = () => {
    setHovering(true);
  };

  return (
    <>
      <mesh
        visible={false}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerEnter={handlePointerEnter}
      >
        <sphereGeometry args={[radius, 64, 64]} />
        <meshStandardMaterial color="blue" />
      </mesh>
      <OrbitCamera planetRadius={radius} />
      <ambientLight intensity={Math.PI / 90} />
      <spotLight
        position={[radius * 10, (radius * 10) / 2, radius * 10]}
        angle={0.15}
        penumbra={1}
        decay={0}
        intensity={Math.PI}
      />
    </>
  );
}
