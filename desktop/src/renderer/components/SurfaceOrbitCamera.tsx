import type { TerrainHandle } from "@hello-terrain/react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { MathUtils, Vector3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface SurfaceOrbitCameraProps {
  terrain?: TerrainHandle;
  center?: Vector3;
  worldRadius: number;
  surfaceClearance?: number;
  maxDistanceMultiplier?: number;
  defaultCameraPosition?: Vector3;
  minZoomSpeed?: number;
  maxZoomSpeed?: number;
  minRotateSpeed?: number;
  maxRotateSpeed?: number;
}

const offset = new Vector3();
const defaultCenter = new Vector3();

export const SurfaceOrbitCamera: React.FC<
  React.PropsWithChildren<SurfaceOrbitCameraProps>
> = ({
  terrain,
  center = defaultCenter,
  worldRadius,
  surfaceClearance = 100,
  maxDistanceMultiplier = 4,
  defaultCameraPosition,
  minZoomSpeed = 0.00000025,
  maxZoomSpeed = 0.5,
  minRotateSpeed = 0.0000025,
  maxRotateSpeed = 0.5,
  children,
}) => {
  const orbitControls = React.useRef<OrbitControlsImpl>(null);
  const { camera, set } = useThree();

  React.useEffect(() => {
    camera.position.copy(
      defaultCameraPosition ||
        new Vector3(worldRadius * 1.25, worldRadius * 0.35, worldRadius * 1.25),
    );
    camera.lookAt(center);
  }, [camera, center, defaultCameraPosition, worldRadius]);

  const getAltitudeAboveTerrain = React.useCallback(() => {
    const sample = terrain?.runtime.surfaceQuery?.sampleTerrainByPosition(
      camera.position as any,
    );
    if (sample?.valid) {
      return Math.max(
        camera.position.clone().sub(sample.position).dot(sample.normal),
        0,
      );
    }
    return Math.max(camera.position.distanceTo(center) - worldRadius, 0);
  }, [camera, center, terrain, worldRadius]);

  const clampAboveTerrain = React.useCallback(() => {
    const sample = terrain?.runtime.surfaceQuery?.sampleTerrainByPosition(
      camera.position as any,
    );
    if (sample?.valid) {
      const signedClearance = camera.position
        .clone()
        .sub(sample.position)
        .dot(sample.normal);
      if (signedClearance < surfaceClearance) {
        camera.position
          .copy(sample.position)
          .addScaledVector(sample.normal, surfaceClearance);
      }
    }

    offset.copy(camera.position).sub(center);
    const distance = offset.length();
    const maxDistance = worldRadius * maxDistanceMultiplier;
    if (distance > maxDistance) {
      camera.position.copy(center).addScaledVector(
        offset.divideScalar(distance),
        maxDistance,
      );
    }
  }, [
    camera,
    center,
    maxDistanceMultiplier,
    surfaceClearance,
    terrain,
    worldRadius,
  ]);

  useFrame(() => {
    if (!orbitControls.current) return;

    const altitude = getAltitudeAboveTerrain();
    const maxAltitude = worldRadius * maxDistanceMultiplier;
    const speedRatio = MathUtils.clamp(altitude / maxAltitude, 0, 1);

    orbitControls.current.zoomSpeed = MathUtils.lerp(
      minZoomSpeed,
      maxZoomSpeed,
      speedRatio,
    );
    orbitControls.current.rotateSpeed = MathUtils.lerp(
      minRotateSpeed,
      maxRotateSpeed,
      speedRatio,
    );

    clampAboveTerrain();
  });

  React.useEffect(() => {
    set({ controls: orbitControls.current });
  }, [set]);

  return (
    <OrbitControls
      ref={orbitControls}
      enablePan={false}
      enableZoom
      maxDistance={worldRadius * maxDistanceMultiplier}
      minDistance={Math.max(1, worldRadius * 0.05)}
      target={center}
    >
      {children}
    </OrbitControls>
  );
};
