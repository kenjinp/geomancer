import type { TerrainHandle } from "@hello-terrain/react";
import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { MathUtils, Vector3 } from "three";

export interface SurfaceFlyCameraProps {
  terrain?: TerrainHandle;
  center?: Vector3;
  worldRadius: number;
  surfaceClearance?: number;
  maxDistanceMultiplier?: number;
  lookSensitivity?: number;
  moveSpeedScale?: number;
  minMoveSpeed?: number;
  maxMoveSpeed?: number;
  rollSpeed?: number;
}

const forward = new Vector3();
const right = new Vector3();
const moveDelta = new Vector3();
const surfaceUp = new Vector3(0, 1, 0);
const fallbackOffset = new Vector3();
const defaultCenter = new Vector3();

export const SurfaceFlyCamera: React.FC<SurfaceFlyCameraProps> = ({
  terrain,
  center = defaultCenter,
  worldRadius,
  surfaceClearance = 1,
  maxDistanceMultiplier = 4,
  lookSensitivity = 0.0025,
  moveSpeedScale = 1.5,
  minMoveSpeed = 5,
  maxMoveSpeed = worldRadius * 0.5,
  rollSpeed = 1.5,
}) => {
  const { camera, gl } = useThree();
  const keys = React.useRef<Set<string>>(new Set());
  const isLocked = React.useRef(false);
  const boost = React.useRef(1);

  React.useEffect(() => {
    camera.lookAt(center);
  }, [camera, center]);

  const sampleUp = React.useCallback(
    (position: Vector3) => {
      const sample = terrain?.runtime.surfaceQuery?.sampleTerrainByPosition(
        position as any,
      );
      if (sample?.valid) {
        surfaceUp.copy(sample.normal);
        return sample;
      }

      fallbackOffset.copy(position).sub(center);
      if (fallbackOffset.lengthSq() > 1e-6) {
        surfaceUp.copy(fallbackOffset).normalize();
      } else {
        surfaceUp.set(0, 1, 0);
      }
      return null;
    },
    [center, terrain],
  );

  React.useEffect(() => {
    const canvas = gl.domElement;

    const requestLock = () => {
      if (!isLocked.current) canvas.requestPointerLock();
    };

    const handleLockChange = () => {
      isLocked.current = document.pointerLockElement === canvas;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isLocked.current) return;
      sampleUp(camera.position);
      camera.rotateOnWorldAxis(surfaceUp, -event.movementX * lookSensitivity);
      camera.rotateX(-event.movementY * lookSensitivity);
    };

    canvas.addEventListener("mousedown", requestLock);
    document.addEventListener("pointerlockchange", handleLockChange);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      canvas.removeEventListener("mousedown", requestLock);
      document.removeEventListener("pointerlockchange", handleLockChange);
      document.removeEventListener("mousemove", handleMouseMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [camera, gl, lookSensitivity, sampleUp]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      keys.current.add(event.code);
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        boost.current = 3;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keys.current.delete(event.code);
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        boost.current = 1;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keys.current.clear();
      boost.current = 1;
    };
  }, []);

  const getAltitudeAboveTerrain = React.useCallback(() => {
    const sample = sampleUp(camera.position);
    if (sample?.valid) {
      return Math.max(
        camera.position.clone().sub(sample.position).dot(sample.normal),
        0,
      );
    }
    return Math.max(camera.position.distanceTo(center) - worldRadius, 0);
  }, [camera, center, sampleUp, worldRadius]);

  const clampToSurface = React.useCallback(() => {
    const sample = sampleUp(camera.position);
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

    fallbackOffset.copy(camera.position).sub(center);
    const distance = fallbackOffset.length();
    const maxDistance = worldRadius * maxDistanceMultiplier;
    if (distance > maxDistance) {
      camera.position.copy(center).addScaledVector(
        fallbackOffset.divideScalar(distance),
        maxDistance,
      );
    }
  }, [
    camera,
    center,
    maxDistanceMultiplier,
    sampleUp,
    surfaceClearance,
    worldRadius,
  ]);

  useFrame((_, delta) => {
    const altitude = getAltitudeAboveTerrain();
    const speed =
      MathUtils.clamp(altitude * moveSpeedScale, minMoveSpeed, maxMoveSpeed) *
      boost.current *
      delta;

    const sample = sampleUp(camera.position);
    if (!sample?.valid) sampleUp(camera.position);
    camera.getWorldDirection(forward);
    right.copy(forward).cross(surfaceUp).normalize();

    moveDelta.set(0, 0, 0);
    const k = keys.current;
    if (k.has("KeyW") || k.has("ArrowUp")) moveDelta.addScaledVector(forward, 1);
    if (k.has("KeyS") || k.has("ArrowDown")) moveDelta.addScaledVector(forward, -1);
    if (k.has("KeyD") || k.has("ArrowRight")) moveDelta.addScaledVector(right, 1);
    if (k.has("KeyA") || k.has("ArrowLeft")) moveDelta.addScaledVector(right, -1);
    if (k.has("Space")) moveDelta.addScaledVector(surfaceUp, 1);
    if (k.has("KeyC") || k.has("ControlLeft")) {
      moveDelta.addScaledVector(surfaceUp, -1);
    }

    if (moveDelta.lengthSq() > 0) {
      moveDelta.normalize().multiplyScalar(speed);
      camera.position.add(moveDelta);
    }

    if (k.has("KeyQ")) camera.rotateZ(rollSpeed * delta);
    if (k.has("KeyE")) camera.rotateZ(-rollSpeed * delta);

    clampToSurface();
  });

  return null;
};
