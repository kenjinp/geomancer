
import { EARTH_AUTHALIC_RADIUS } from "@/constants";
import { Terrain, useTerrain } from "@hello-terrain/react";
import { createCubeSphereTopology } from "@hello-terrain/three";
import { extend, type ThreeEvent } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useCallback, useMemo } from "react";
import { clamp, float, length, mix, smoothstep, varying, vec3 } from "three/tsl";
import * as THREE from "three/webgpu";
import { useStore } from "zustand";

import store, { CameraMode } from "@/state/Context";

import { getColorForElevation } from "../terrain/nodes/colors";
import { fbm } from "../tsl/fm";
import { Atmosphere } from "./atmosphere/Atmosphere";
import { FlyCamera } from "./FlyCamera";
import { MouseAltitudeIndicator } from "./MouseFollower";
import { OrbitCamera } from "./OrbitCamera";

extend({ MeshStandardNodeMaterial: THREE.MeshStandardNodeMaterial });

export function TerrainRenderer() {
  const cameraMode = useStore(store).cameraMode;

  const topology = useMemo(
    () =>
      createCubeSphereTopology({
        radius: EARTH_AUTHALIC_RADIUS,
        invert: false,
      }),
    [],
  );

  // Live terrain controls. Each value is baked into the elevation TSL closure
  // below; changing one produces a new `elevation` function identity which the
  // terrain library detects and uses to regenerate the height field.
  const {
    continentFrequency,
    seaLevel,
    coastWidth,
    continentWarp,
    warpFrequency,
    landHeight,
    oceanDepth,
    mountainFrequency,
    ruggedness,
    elevationScale,
    maxLevel,
  } = useControls("Terrain", {
    continents: folder({
      continentFrequency: { value: 2, min: 0.2, max: 8, step: 0.1 },
      seaLevel: { value: 0.5, min: 0, max: 1, step: 0.01 },
      coastWidth: { value: 0.04, min: 0.001, max: 0.3, step: 0.001 },
      continentWarp: { value: 0.15, min: 0, max: 1, step: 0.01 },
      warpFrequency: { value: 1.5, min: 0.2, max: 6, step: 0.1 },
    }),
    relief: folder({
      landHeight: { value: 0.6, min: 0, max: 2, step: 0.01 },
      oceanDepth: { value: 1, min: 0, max: 2, step: 0.01 },
      mountainFrequency: { value: 8, min: 1, max: 24, step: 0.5 },
      ruggedness: { value: 0.5, min: 0, max: 1.5, step: 0.01 },
    }),
    elevationScale: { value: 10_000, min: 1_000, max: 20_000, step: 500 },
    // The elevation field is evaluated from `worldPosition` (~6.37e6 m) in a
    // float32 compute pass. ULP at that magnitude is ~0.5 m, so once tile
    // vertices get closer than a few metres their positions differ by ~1 ULP,
    // the noise input quantises, and the surface dissolves into shard noise.
    // Level 14 keeps vertices ~10 m apart (well above the precision floor);
    // raising this past ~15 reintroduces the close-up shards.
    maxLevel: { value: 14, min: 6, max: 18, step: 1 },
  });

  // Believable planetary terrain from fractal Brownian motion (FBM) of Perlin
  // noise. The output is a normalized height (roughly -0.85..1.0) that the
  // library multiplies by `elevationScale` to get metres, so the value also maps
  // cleanly onto the NOAA elevation colour ramp used for shading.
  const elevation = useMemo(
    () =>
      ({ worldPosition }) => {
        const dir = worldPosition.normalize();

        // Domain-warp the sample direction so coastlines meander instead of
        // looking like smooth, uniform blobs.
        const warp = vec3(
          fbm(dir.mul(float(warpFrequency))),
          fbm(dir.mul(float(warpFrequency)).add(vec3(19.3, 7.1, 33.7))),
          fbm(dir.mul(float(warpFrequency)).add(vec3(41.2, 17.9, 5.3))),
        )
          .sub(0.5)
          .mul(float(continentWarp));
        const warpedDir = dir.add(warp);

        // Low-frequency FBM (~0..1) decides where land sits relative to the sea.
        const continents = fbm(warpedDir.mul(float(continentFrequency)));
        const relative = continents.sub(float(seaLevel));
        const land = smoothstep(float(0), float(coastWidth), relative);

        // Ridged multifractal: sharp mountain crests, concentrated on land.
        const ridgeNoise = fbm(dir.mul(float(mountainFrequency)));
        const ridges = float(1).sub(ridgeNoise.mul(2).sub(1).abs());
        const mountains = ridges.mul(ridges).mul(float(ruggedness));

        const landElevation = relative
          .mul(float(landHeight))
          .add(mountains.mul(land));
        const oceanElevation = relative.mul(float(oceanDepth));
        const height = mix(oceanElevation, landElevation, land);

        return clamp(height, float(-0.85), float(1));
      },
    [
      continentFrequency,
      seaLevel,
      coastWidth,
      continentWarp,
      warpFrequency,
      landHeight,
      oceanDepth,
      mountainFrequency,
      ruggedness,
    ],
  );

  const terrain = useTerrain({
    topology,
    radius: EARTH_AUTHALIC_RADIUS,
    maxLevel,
    maxNodes: Math.pow(2, 10),
    skirtScale: EARTH_AUTHALIC_RADIUS / 10,
    elevationScale,
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
        {({ positionNode }) => {
          // The displaced vertex sits at `radius + elevationMetres` from the
          // planet centre, so recover the elevation by subtracting the radius.
          // This MUST happen in the vertex stage (wrapped in `varying`): doing
          // `length(worldPos) - 6.37e6` per fragment subtracts two huge, nearly
          // equal float32 magnitudes, and the cancellation error changes with
          // camera distance — which made the terrain colour flicker by altitude.
          const elevationMetres = varying(
            length(positionNode).sub(float(EARTH_AUTHALIC_RADIUS)),
          );
          return (
            <meshStandardNodeMaterial
              positionNode={positionNode}
              colorNode={getColorForElevation(float(elevationMetres)).rgb}
              metalness={0.0}
              roughness={1.0}
            />
          );
        }}
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
        key="atmo"
        planetRadius={EARTH_AUTHALIC_RADIUS}
        sunDirection={sunDirection}
      />
      {cameraMode === CameraMode.FLY ? (
        <FlyCamera planetRadius={EARTH_AUTHALIC_RADIUS} terrain={terrain} />
      ) : (
        <OrbitCamera planetRadius={EARTH_AUTHALIC_RADIUS} terrain={terrain} />
      )}
      <MouseAltitudeIndicator terrain={terrain} />
    </>
  );
}