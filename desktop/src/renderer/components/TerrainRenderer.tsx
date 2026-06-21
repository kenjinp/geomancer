
import { EARTH_AUTHALIC_RADIUS } from "@/constants";
import { Terrain, useTerrain } from "@hello-terrain/react";
import { createCubeSphereTopology } from "@hello-terrain/three";
import { extend, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo } from "react";
import { clamp, float, Fn, instanceIndex, smoothstep } from "three/tsl";
import * as THREE from "three/webgpu";
import { fbm } from "../tsl/fm";
import { hashColor } from "../tsl/hash";
import { Atmosphere } from "./atmosphere/Atmosphere";
import { MouseAltitudeIndicator } from "./MouseFollower";
import { OrbitCamera } from "./OrbitCamera";

extend({ MeshStandardNodeMaterial: THREE.MeshStandardNodeMaterial });

export function TerrainRenderer() {

  const topology = useMemo(
    () =>
      createCubeSphereTopology({
        radius: EARTH_AUTHALIC_RADIUS,
        invert: false,
      }),
    [],
  );

  const elevation = useMemo(
    () =>({ worldPosition }) => {
      const dir = worldPosition.normalize();
      const noiseFrequency = 4;
      const ruggedness = 4;
      const seaLevel = 0;
      const continents = fbm(dir.mul(float(noiseFrequency)));
      const sea = float(seaLevel);
      const land = smoothstep(sea, sea.add(0.05), continents);
      const base = clamp(continents.sub(sea), float(0), float(1));
  
      // Ridged multifractal detail: sharp crests, deep valleys on land.
      const ridgeNoise = fbm(dir.mul(float(noiseFrequency * 4)));
      const ridges = float(1).sub(ridgeNoise.mul(2).sub(1).abs());
      const detail = ridges.mul(ridges).mul(float(ruggedness));
  
      return clamp(base.add(detail), float(0), float(1)).mul(land);
    },
    [],
  );


  const terrain = useTerrain({
    topology,
    radius: EARTH_AUTHALIC_RADIUS,
    maxLevel: 18,
    maxNodes: Math.pow(2, 10),
    skirtScale: EARTH_AUTHALIC_RADIUS / 10,
    elevationScale: 10_000,
    elevation,
  });


  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
  }, []);

  // Direction from the planet centre toward the sun. Drives both the surface
  // lighting (directional light) and the atmospheric scattering effect, so the
  // day/night terminator lines up with the sky colours.
  const sunDirection = useMemo(
    () => new THREE.Vector3(1.0, 0.35, 0.6).normalize(),
    [],
  );

  return (
    <>
      <Terrain
        terrain={terrain}
        frustumCulled={false}
        onPointerDown={handlePointerDown}
      >
        {({ positionNode }) => (
          <meshStandardNodeMaterial
            positionNode={positionNode}
            colorNode={Fn(() => hashColor(instanceIndex))()}
            metalness={0.05}
            roughness={0.95}
          />
        )}
      </Terrain>
      <directionalLight
        position={[
          sunDirection.x * EARTH_AUTHALIC_RADIUS * 5,
          sunDirection.y * EARTH_AUTHALIC_RADIUS * 5,
          sunDirection.z * EARTH_AUTHALIC_RADIUS * 5,
        ]}
        intensity={Math.PI}
      />
      <Atmosphere
        planetRadius={EARTH_AUTHALIC_RADIUS}
        sunDirection={sunDirection}
      />
      <OrbitCamera planetRadius={EARTH_AUTHALIC_RADIUS} terrain={terrain} />
      <MouseAltitudeIndicator terrain={terrain} />
    </>
  );
}