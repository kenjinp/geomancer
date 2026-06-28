import {
  EARTH_AREA_TORUS_BOUNDING_RADIUS,
  EARTH_AREA_TORUS_MAJOR_RADIUS,
  EARTH_AREA_TORUS_MINOR_RADIUS,
} from "@/constants";
import { Terrain, useTerrain } from "@hello-terrain/react";
import { createTorusTopology, quadtreeUpdate } from "@hello-terrain/three";
import { extend, type ThreeEvent, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { useCallback, useEffect, useMemo } from "react";
import {
  clamp,
  float,
  mix,
  smoothstep,
  sqrt,
  varying,
  vec3,
} from "three/tsl";
import * as THREE from "three/webgpu";
import { useStore } from "zustand";

import store, { CameraMode, MapLayer } from "@/state/Context";

import { getColorForElevation } from "../terrain/nodes/colors";
import { fbm } from "../tsl/fm";
import { TorusAtmosphere } from "./atmosphere/TorusAtmosphere";
import { SurfaceCharacterController } from "./character/SurfaceCharacterController";
import { MouseAltitudeIndicator } from "./MouseFollower";
import { Bloom } from "./post/Bloom";
import { Sun } from "./sun/Sun";
import { SurfaceFlyCamera } from "./SurfaceFlyCamera";
import { SurfaceOrbitCamera } from "./SurfaceOrbitCamera";

extend({ MeshStandardNodeMaterial: THREE.MeshStandardNodeMaterial });

export function TorusTerrainRenderer() {
  const cameraMode = useStore(store).cameraMode;
  const atmosphereEnabled = useStore(store).mapLayers.includes(
    MapLayer.ATMOSPHERE,
  );

  const topology = useMemo(
    () =>
      createTorusTopology({
        majorRadius: EARTH_AREA_TORUS_MAJOR_RADIUS,
        minorRadius: EARTH_AREA_TORUS_MINOR_RADIUS,
        invert: false,
      }),
    [],
  );

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
  } = useControls("Torus Terrain", {
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
    maxLevel: { value: 14, min: 6, max: 18, step: 1 },
  });

  const { lodMode, targetPixels, distanceFactor } = useControls("Torus LOD", {
    lodMode: { value: "distance", options: ["distance", "screen"] },
    targetPixels: { value: 16, min: 4, max: 128, step: 1 },
    distanceFactor: { value: 4, min: 0.5, max: 4, step: 0.1 },
  });

  const elevation = useMemo(
    () =>
      ({ worldPosition }) => {
        const p = worldPosition.mul(float(1 / EARTH_AREA_TORUS_MAJOR_RADIUS));

        const warp = vec3(
          fbm(p.mul(float(warpFrequency))),
          fbm(p.mul(float(warpFrequency)).add(vec3(19.3, 7.1, 33.7))),
          fbm(p.mul(float(warpFrequency)).add(vec3(41.2, 17.9, 5.3))),
        )
          .sub(0.5)
          .mul(float(continentWarp));
        const warpedPosition = p.add(warp);

        const continents = fbm(warpedPosition.mul(float(continentFrequency)));
        const relative = continents.sub(float(seaLevel));
        const land = smoothstep(float(0), float(coastWidth), relative);

        const ridgeNoise = fbm(p.mul(float(mountainFrequency)));
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
    maxLevel,
    maxNodes: Math.pow(2, 10),
    skirtScale: EARTH_AREA_TORUS_MINOR_RADIUS / 10,
    elevationScale,
    elevation,
    // Frustum culling depends on the full view-projection matrix, not just
    // camera position. Force the hello-terrain runner to refresh it for
    // rotate-only camera moves as well.
    cameraHysteresis: 0,
  });

  const viewportHeight = useThree((state) => state.size.height);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    if (!terrain.ready) return;
    terrain.graph.set(quadtreeUpdate, (prev) => {
      const params = prev as {
        mode: "distance" | "screen";
        distanceFactor?: number;
        projectionFactor?: number;
        targetPixels?: number;
      };
      if (lodMode === "screen") {
        const fovRadians = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
        params.mode = "screen";
        params.projectionFactor =
          viewportHeight / (2 * Math.tan(fovRadians / 2));
        params.targetPixels = targetPixels;
      } else {
        params.mode = "distance";
        params.distanceFactor = distanceFactor;
      }
      return params;
    });
  }, [
    terrain.graph,
    terrain.ready,
    lodMode,
    targetPixels,
    distanceFactor,
    viewportHeight,
    camera,
  ]);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
  }, []);

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
          const rho = sqrt(positionNode.x.mul(positionNode.x).add(
            positionNode.z.mul(positionNode.z),
          ));
          const tubeX = rho.sub(float(EARTH_AREA_TORUS_MAJOR_RADIUS));
          const tubeDistance = sqrt(
            tubeX.mul(tubeX).add(positionNode.y.mul(positionNode.y)),
          );
          const elevationMetres = varying(
            tubeDistance.sub(float(EARTH_AREA_TORUS_MINOR_RADIUS)),
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
          sunDirection.x * EARTH_AREA_TORUS_BOUNDING_RADIUS * 5,
          sunDirection.y * EARTH_AREA_TORUS_BOUNDING_RADIUS * 5,
          sunDirection.z * EARTH_AREA_TORUS_BOUNDING_RADIUS * 5,
        ]}
        intensity={Math.PI}
      />
      <Sun direction={sunDirection} />
      <TorusAtmosphere
        key="torus-atmo"
        majorRadius={EARTH_AREA_TORUS_MAJOR_RADIUS}
        minorRadius={EARTH_AREA_TORUS_MINOR_RADIUS}
        sunDirection={sunDirection}
        enabled={atmosphereEnabled}
      />
      <Bloom />
      {cameraMode === CameraMode.FLY && (
        <SurfaceFlyCamera
          terrain={terrain}
          worldRadius={EARTH_AREA_TORUS_BOUNDING_RADIUS}
        />
      )}
      {cameraMode === CameraMode.CHARACTER && (
        <SurfaceCharacterController terrain={terrain} />
      )}
      {cameraMode === CameraMode.ORBIT && (
        <SurfaceOrbitCamera
          terrain={terrain}
          worldRadius={EARTH_AREA_TORUS_BOUNDING_RADIUS}
        />
      )}
      <MouseAltitudeIndicator terrain={terrain} />
    </>
  );
}
