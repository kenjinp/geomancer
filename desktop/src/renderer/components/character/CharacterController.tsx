import type { TerrainHandle } from "@hello-terrain/react";
import { useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import * as THREE from "three/webgpu";

import { CharacterModel } from "./CharacterModel";
import {
  type CharacterMotionState,
  useSphereCharacterController,
} from "./useSphereCharacterController";
import { useKeyboardInput } from "./useKeyboardInput";
import { useSphereThirdPersonCamera } from "./useSphereThirdPersonCamera";

export interface CharacterControllerProps {
  planetRadius: number;
  planetPosition?: Vector3;
  terrain?: TerrainHandle;
  cameraRadius?: number;
  cameraMinRadius?: number;
  cameraMaxRadius?: number;
  cameraSensitivityX?: number;
  cameraSensitivityY?: number;
}

export function CharacterController({
  planetRadius,
  planetPosition,
  terrain,
  cameraRadius = 4.8,
  cameraMinRadius = 1.75,
  cameraMaxRadius = 12,
  cameraSensitivityX = 0.16,
  cameraSensitivityY = 0.12,
}: CharacterControllerProps) {
  const camera = useThree((state) => state.camera);
  const inputRef = useKeyboardInput(true);
  const viewVectorRef = useRef(new Vector3(0, 0, 1));
  const latestStateRef = useRef<CharacterMotionState>("falling");
  const speedRef = useRef(0);

  const planetCenter = useMemo(
    () => planetPosition ?? new Vector3(),
    [planetPosition],
  );

  // Plain (mediump) material so the contact-shadow disc renders through the
  // same view pipeline as the terrain and tracks the ground in lock-step.
  const shadowMaterial = useMemo(
    () =>
      new THREE.MeshBasicNodeMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.22,
      }),
    [],
  );
  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial]);

  // Snapshot the camera position the moment the mode is entered so the
  // character spawns beneath it and the camera keeps the current view angle.
  const initialCameraPosition = useMemo(
    () => camera.position.clone(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const runtime = terrain?.runtime ?? {
    query: null,
    surfaceQuery: null,
    sphereQuery: null,
    raycast: null,
  };
  const ready = terrain?.ready ?? false;

  const { groupRef, positionRef, turnRateRef, state } =
    useSphereCharacterController({
      inputRef,
      viewVectorRef,
      terrainRuntime: runtime,
      planetRadius,
      planetCenter,
      initialCameraPosition,
      enabled: ready,
      onUpdate: (snapshot) => {
        latestStateRef.current = snapshot.state;
        speedRef.current = Math.sqrt(
          snapshot.velocity.x * snapshot.velocity.x +
            snapshot.velocity.y * snapshot.velocity.y +
            snapshot.velocity.z * snapshot.velocity.z,
        );
      },
    });

  useSphereThirdPersonCamera({
    targetPositionRef: positionRef,
    terrainRuntime: runtime,
    viewVectorRef,
    planetRadius,
    planetCenter,
    initialCameraPosition,
    targetHeight: 1.15,
    radius: cameraRadius,
    minRadius: cameraMinRadius,
    maxRadius: cameraMaxRadius,
    sensitivityX: cameraSensitivityX,
    sensitivityY: cameraSensitivityY,
    enabled: ready,
    zoomEnabled: ready,
  });

  if (!ready) return null;

  return (
    <>
      {/* The scene's only light is the sun (a single directionalLight), so the
          character's shaded side renders pure black up close. A dim ambient
          fill lifts the shadows without noticeably brightening the planet. */}
      <ambientLight intensity={1.1} color="#9fb4cc" />
      <group ref={groupRef}>
        {/* Soft contact shadow blob beneath the feet (local +Y is radial up). */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.56, 0]}
          material={shadowMaterial}
          receiveShadow
        >
          <circleGeometry args={[0.35, 20]} />
        </mesh>
        <Suspense fallback={null}>
          <CharacterModel
            turnRateRef={turnRateRef}
            speedRef={speedRef}
            motionState={state}
            inputRef={inputRef}
          />
        </Suspense>
      </group>
    </>
  );
}
