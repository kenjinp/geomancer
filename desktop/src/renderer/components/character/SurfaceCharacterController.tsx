import type { TerrainHandle, TerrainRuntime } from "@hello-terrain/react";
import { useThree, useFrame } from "@react-three/fiber";
import {
  Suspense,
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MathUtils, Matrix4, Quaternion, Ray, Vector3 } from "three";
import * as THREE from "three/webgpu";

import { CharacterModel } from "./CharacterModel";
import type { CharacterInputState } from "./useKeyboardInput";
import { useKeyboardInput } from "./useKeyboardInput";

const CHARACTER_RIDE_HEIGHT = 0.57;
const FOOT_CLEARANCE = 0.03;

const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.2;
const JUMP_SPEED = 7.1;
const GRAVITY = 18;

export type SurfaceCharacterMotionState =
  | "idle"
  | "walking"
  | "sprinting"
  | "jumping"
  | "falling";

export interface SurfaceCharacterControllerProps {
  terrain?: TerrainHandle;
  cameraRadius?: number;
  cameraMinRadius?: number;
  cameraMaxRadius?: number;
  cameraSensitivityX?: number;
  cameraSensitivityY?: number;
}

type UseSurfaceCharacterControllerParams = {
  inputRef: MutableRefObject<CharacterInputState>;
  viewVectorRef: MutableRefObject<Vector3>;
  terrainRuntime: TerrainRuntime;
  initialCameraPosition: Vector3;
  enabled?: boolean;
  onUpdate?: (snapshot: {
    position: Vector3;
    velocity: Vector3;
    isGrounded: boolean;
    state: SurfaceCharacterMotionState;
  }) => void;
};

type UseSurfaceThirdPersonCameraParams = {
  targetPositionRef: MutableRefObject<Vector3>;
  terrainRuntime?: TerrainRuntime;
  viewVectorRef: MutableRefObject<Vector3>;
  initialCameraPosition: Vector3;
  targetHeight?: number;
  radius?: number;
  minRadius?: number;
  maxRadius?: number;
  sensitivityX?: number;
  sensitivityY?: number;
  enabled?: boolean;
  zoomEnabled?: boolean;
};

function getMotionState(
  horizontalSpeed: number,
  isGrounded: boolean,
  verticalVelocity: number,
  sprint: boolean,
): SurfaceCharacterMotionState {
  if (!isGrounded) return verticalVelocity > 0.05 ? "jumping" : "falling";
  if (horizontalSpeed < 0.25) return "idle";
  return sprint ? "sprinting" : "walking";
}

function useSurfaceCharacterController({
  inputRef,
  viewVectorRef,
  terrainRuntime,
  initialCameraPosition,
  enabled = true,
  onUpdate,
}: UseSurfaceCharacterControllerParams) {
  const groupRef = useRef<THREE.Group>(null);
  const positionRef = useRef(new Vector3());
  const velocityRef = useRef(new Vector3());
  const isGroundedRef = useRef(false);
  const turnRateRef = useRef(0);
  const previousJumpRef = useRef(false);
  const initializedRef = useRef(false);
  const headingRef = useRef(new Vector3(0, 0, 1));
  const upRef = useRef(new Vector3(0, 1, 0));
  const [state, setState] =
    useState<SurfaceCharacterMotionState>("falling");

  const scratch = useMemo(
    () => ({
      up: new Vector3(),
      flatView: new Vector3(),
      leftDir: new Vector3(),
      localInput: new Vector3(),
      worldMoveDir: new Vector3(),
      targetVelocity: new Vector3(),
      tangentialVelocity: new Vector3(),
      sampleOffset: new Vector3(),
      targetHeading: new Vector3(),
      cross: new Vector3(),
      rightAxis: new Vector3(),
      orientation: new Matrix4(),
      quaternion: new Quaternion(),
    }),
    [],
  );

  useFrame((_frame, dt) => {
    if (!enabled) return;
    const surfaceQuery = terrainRuntime.surfaceQuery;
    if (!surfaceQuery) return;

    if (!initializedRef.current) {
      const sample = surfaceQuery.sampleTerrainByPosition(
        initialCameraPosition as any,
      );
      if (!sample.valid) return;

      upRef.current.copy(sample.normal);
      positionRef.current
        .copy(sample.position)
        .addScaledVector(
          sample.normal,
          CHARACTER_RIDE_HEIGHT + FOOT_CLEARANCE,
        );
      velocityRef.current.set(0, 0, 0);
      isGroundedRef.current = true;

      scratch.flatView.set(0, 0, 1);
      scratch.flatView.addScaledVector(
        sample.normal,
        -scratch.flatView.dot(sample.normal),
      );
      if (scratch.flatView.lengthSq() < 1e-6) {
        scratch.flatView.set(1, 0, 0);
        scratch.flatView.addScaledVector(
          sample.normal,
          -scratch.flatView.dot(sample.normal),
        );
      }
      headingRef.current.copy(scratch.flatView).normalize();
      initializedRef.current = true;
    }

    const delta = Math.min(dt, 1 / 20);
    const input = inputRef.current;
    const groundBefore = surfaceQuery.sampleTerrainByPosition(
      positionRef.current as any,
    );
    if (groundBefore.valid) upRef.current.copy(groundBefore.normal);
    scratch.up.copy(upRef.current);

    scratch.flatView
      .copy(viewVectorRef.current)
      .addScaledVector(scratch.up, -viewVectorRef.current.dot(scratch.up));
    if (scratch.flatView.lengthSq() < 1e-6) {
      scratch.flatView.copy(headingRef.current);
    }
    scratch.flatView.normalize();
    scratch.leftDir.copy(scratch.up).cross(scratch.flatView);

    scratch.localInput.set(
      (input.left ? 1 : 0) + (input.right ? -1 : 0),
      0,
      (input.forward ? 1 : 0) + (input.backward ? -1 : 0),
    );
    if (scratch.localInput.lengthSq() > 1) scratch.localInput.normalize();

    const wantsMove = scratch.localInput.lengthSq() > 0.0001;
    const targetSpeed = wantsMove ? (input.sprint ? SPRINT_SPEED : WALK_SPEED) : 0;

    scratch.worldMoveDir
      .copy(scratch.flatView)
      .multiplyScalar(scratch.localInput.z)
      .addScaledVector(scratch.leftDir, scratch.localInput.x);
    if (scratch.worldMoveDir.lengthSq() > 1e-6) scratch.worldMoveDir.normalize();

    scratch.targetVelocity.copy(scratch.worldMoveDir).multiplyScalar(targetSpeed);

    let verticalSpeed = velocityRef.current.dot(scratch.up);
    scratch.tangentialVelocity
      .copy(velocityRef.current)
      .addScaledVector(scratch.up, -verticalSpeed);

    const horizontalBlend = 1 - Math.exp(-10 * delta);
    scratch.tangentialVelocity.addScaledVector(
      scratch.targetVelocity.sub(scratch.tangentialVelocity),
      horizontalBlend,
    );

    const jumpPressed = input.jump;
    const jumpJustPressed = jumpPressed && !previousJumpRef.current;
    previousJumpRef.current = jumpPressed;

    if (jumpJustPressed && isGroundedRef.current) {
      verticalSpeed = JUMP_SPEED;
      isGroundedRef.current = false;
    } else {
      verticalSpeed -= GRAVITY * delta;
    }

    velocityRef.current
      .copy(scratch.tangentialVelocity)
      .addScaledVector(scratch.up, verticalSpeed);

    positionRef.current.addScaledVector(velocityRef.current, delta);

    const groundAfter = surfaceQuery.sampleTerrainByPosition(
      positionRef.current as any,
    );
    if (groundAfter.valid) {
      scratch.sampleOffset.copy(positionRef.current).sub(groundAfter.position);
      const signedHeight = scratch.sampleOffset.dot(groundAfter.normal);
      const snappedHeight = CHARACTER_RIDE_HEIGHT + FOOT_CLEARANCE;
      const normalVelocity = velocityRef.current.dot(groundAfter.normal);

      if (signedHeight <= snappedHeight && normalVelocity <= 0) {
        positionRef.current
          .copy(groundAfter.position)
          .addScaledVector(groundAfter.normal, snappedHeight);
        velocityRef.current.addScaledVector(
          groundAfter.normal,
          -velocityRef.current.dot(groundAfter.normal),
        );
        upRef.current.copy(groundAfter.normal);
        isGroundedRef.current = true;
      } else if (signedHeight > snappedHeight + 0.2) {
        isGroundedRef.current = false;
        upRef.current.copy(groundAfter.normal);
      }
    }

    scratch.up.copy(upRef.current);
    scratch.tangentialVelocity
      .copy(velocityRef.current)
      .addScaledVector(scratch.up, -velocityRef.current.dot(scratch.up));
    const horizontalSpeed = scratch.tangentialVelocity.length();

    scratch.flatView.copy(headingRef.current);
    scratch.flatView.addScaledVector(
      scratch.up,
      -scratch.flatView.dot(scratch.up),
    );
    if (scratch.flatView.lengthSq() > 1e-6) {
      headingRef.current.copy(scratch.flatView).normalize();
    }

    if (horizontalSpeed > 0.05) {
      scratch.targetHeading
        .copy(scratch.tangentialVelocity)
        .divideScalar(horizontalSpeed);
      const cross = scratch.cross
        .copy(headingRef.current)
        .cross(scratch.targetHeading);
      const signedAngle = Math.atan2(
        cross.dot(scratch.up),
        headingRef.current.dot(scratch.targetHeading),
      );
      const damp = 1 - Math.exp(-12 * delta);
      const stepAngle = signedAngle * damp;
      headingRef.current.applyAxisAngle(scratch.up, stepAngle).normalize();
      turnRateRef.current = stepAngle / Math.max(delta, 1e-4);
    } else {
      turnRateRef.current *= Math.exp(-8 * delta);
    }

    const verticalVelocity = velocityRef.current.dot(scratch.up);
    const nextState = getMotionState(
      horizontalSpeed,
      isGroundedRef.current,
      verticalVelocity,
      input.sprint,
    );
    if (nextState !== state) setState(nextState);

    if (groupRef.current) {
      groupRef.current.position.copy(positionRef.current);
      scratch.rightAxis.copy(scratch.up).cross(headingRef.current).normalize();
      scratch.orientation.makeBasis(
        scratch.rightAxis,
        scratch.up,
        headingRef.current,
      );
      scratch.quaternion.setFromRotationMatrix(scratch.orientation);
      groupRef.current.quaternion.copy(scratch.quaternion);
    }

    onUpdate?.({
      position: positionRef.current,
      velocity: velocityRef.current,
      isGrounded: isGroundedRef.current,
      state: nextState,
    });
  });

  return {
    groupRef,
    positionRef,
    velocityRef,
    turnRateRef,
    isGroundedRef,
    state,
  };
}

function useSurfaceThirdPersonCamera({
  targetPositionRef,
  terrainRuntime,
  viewVectorRef,
  initialCameraPosition,
  targetHeight = 1.15,
  radius = 4.8,
  minRadius = 1.75,
  maxRadius = 12,
  sensitivityX = 0.16,
  sensitivityY = 0.12,
  enabled = true,
  zoomEnabled = true,
}: UseSurfaceThirdPersonCameraParams) {
  const { camera, gl } = useThree();
  const phiRef = useRef(18);
  const currentRadiusRef = useRef(radius);
  const desiredRadiusRef = useRef(radius);
  const upRef = useRef(new Vector3(0, 1, 0));
  const pendingYawRef = useRef(0);
  const smoothedTargetRef = useRef(new Vector3());
  const smoothedCameraPositionRef = useRef(new Vector3());
  const initializedRef = useRef(false);
  const cameraSeededRef = useRef(false);

  const scratch = useMemo(
    () => ({
      up: new Vector3(),
      target: new Vector3(),
      desiredCameraPosition: new Vector3(),
      resolvedCameraPosition: new Vector3(),
      offsetDir: new Vector3(),
      cameraDirection: new Vector3(),
      sampleOffset: new Vector3(),
      collisionRay: new Ray(),
    }),
    [],
  );

  useEffect(() => {
    const clamped = MathUtils.clamp(radius, minRadius, maxRadius);
    desiredRadiusRef.current = clamped;
    currentRadiusRef.current = MathUtils.clamp(
      currentRadiusRef.current,
      minRadius,
      maxRadius,
    );
  }, [maxRadius, minRadius, radius]);

  useEffect(() => {
    if (!enabled) return;

    const element = gl.domElement;

    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== element) return;
      pendingYawRef.current -=
        event.movementX * sensitivityX * MathUtils.DEG2RAD;
      phiRef.current = MathUtils.clamp(
        phiRef.current + event.movementY * sensitivityY,
        -20,
        80,
      );
    };

    const onCanvasClick = () => {
      if (document.pointerLockElement !== element) {
        void element.requestPointerLock();
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    element.addEventListener("click", onCanvasClick);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      element.removeEventListener("click", onCanvasClick);
      if (document.pointerLockElement === element) document.exitPointerLock();
    };
  }, [enabled, gl, sensitivityX, sensitivityY]);

  useEffect(() => {
    if (!enabled) return;

    const element = gl.domElement;
    const onWheel = (event: WheelEvent) => {
      if (!zoomEnabled) return;
      event.preventDefault();
      desiredRadiusRef.current = MathUtils.clamp(
        desiredRadiusRef.current + event.deltaY * 0.01,
        minRadius,
        maxRadius,
      );
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
    };
  }, [enabled, gl, maxRadius, minRadius, zoomEnabled]);

  useEffect(() => {
    return () => {
      camera.up.set(0, 1, 0);
    };
  }, [camera]);

  useFrame((_state, dt) => {
    if (!enabled) return;
    const surfaceQuery = terrainRuntime?.surfaceQuery;
    if (!surfaceQuery) return;
    const delta = Math.min(dt, 1 / 20);

    const ground = surfaceQuery.sampleTerrainByPosition(
      targetPositionRef.current as any,
    );
    if (ground.valid) upRef.current.copy(ground.normal);
    scratch.up.copy(upRef.current);

    scratch.target
      .copy(targetPositionRef.current)
      .addScaledVector(scratch.up, targetHeight);

    if (!initializedRef.current) {
      scratch.cameraDirection.copy(scratch.target).sub(initialCameraPosition);
      viewVectorRef.current
        .copy(scratch.cameraDirection)
        .addScaledVector(
          scratch.up,
          -scratch.cameraDirection.dot(scratch.up),
        );
      if (viewVectorRef.current.lengthSq() < 1e-6) {
        viewVectorRef.current.set(1, 0, 0);
        viewVectorRef.current.addScaledVector(
          scratch.up,
          -viewVectorRef.current.dot(scratch.up),
        );
      }
      viewVectorRef.current.normalize();
      smoothedTargetRef.current.copy(scratch.target);
      initializedRef.current = true;
    }

    if (pendingYawRef.current !== 0) {
      viewVectorRef.current.applyAxisAngle(scratch.up, pendingYawRef.current);
      pendingYawRef.current = 0;
    }
    viewVectorRef.current.addScaledVector(
      scratch.up,
      -viewVectorRef.current.dot(scratch.up),
    );
    if (viewVectorRef.current.lengthSq() < 1e-6) {
      viewVectorRef.current.set(1, 0, 0);
      viewVectorRef.current.addScaledVector(
        scratch.up,
        -viewVectorRef.current.dot(scratch.up),
      );
    }
    viewVectorRef.current.normalize();

    const targetBlend = 1 - Math.exp(-10 * delta);
    smoothedTargetRef.current.lerp(scratch.target, targetBlend);

    const radiusBlend = 1 - Math.exp(-12 * delta);
    currentRadiusRef.current = MathUtils.lerp(
      currentRadiusRef.current,
      desiredRadiusRef.current,
      radiusBlend,
    );

    const phiRad = MathUtils.degToRad(phiRef.current);
    scratch.offsetDir
      .copy(viewVectorRef.current)
      .multiplyScalar(-Math.cos(phiRad))
      .addScaledVector(scratch.up, Math.sin(phiRad));
    scratch.desiredCameraPosition
      .copy(smoothedTargetRef.current)
      .addScaledVector(scratch.offsetDir, currentRadiusRef.current);

    scratch.resolvedCameraPosition.copy(scratch.desiredCameraPosition);

    scratch.cameraDirection
      .copy(scratch.desiredCameraPosition)
      .sub(smoothedTargetRef.current);
    const desiredDistance = scratch.cameraDirection.length();
    if (desiredDistance > 1e-6) {
      scratch.cameraDirection.divideScalar(desiredDistance);
      const terrainRaycast = terrainRuntime?.raycast;
      if (terrainRaycast) {
        scratch.collisionRay.origin.copy(smoothedTargetRef.current);
        scratch.collisionRay.direction.copy(scratch.cameraDirection);
        const hit = terrainRaycast.pick(scratch.collisionRay as any, {
          maxSteps: 96,
          refinementSteps: 6,
          maxDistance: desiredDistance,
        });
        if (hit && hit.distance < desiredDistance) {
          scratch.resolvedCameraPosition
            .copy(hit.position)
            .addScaledVector(scratch.cameraDirection, -0.45)
            .addScaledVector(hit.normal, 0.2);
        }
      }
    }

    const cameraGround = surfaceQuery.sampleTerrainByPosition(
      scratch.resolvedCameraPosition as any,
    );
    if (cameraGround.valid) {
      scratch.sampleOffset
        .copy(scratch.resolvedCameraPosition)
        .sub(cameraGround.position);
      const signedHeight = scratch.sampleOffset.dot(cameraGround.normal);
      if (signedHeight < 0.35) {
        scratch.resolvedCameraPosition
          .copy(cameraGround.position)
          .addScaledVector(cameraGround.normal, 0.35);
      }
    }

    if (!cameraSeededRef.current) {
      smoothedCameraPositionRef.current.copy(scratch.resolvedCameraPosition);
      cameraSeededRef.current = true;
    }
    const followBlend = 1 - Math.exp(-8 * delta);
    smoothedCameraPositionRef.current.lerp(
      scratch.resolvedCameraPosition,
      followBlend,
    );

    camera.up.copy(scratch.up);
    camera.position.copy(smoothedCameraPositionRef.current);
    camera.lookAt(smoothedTargetRef.current);
  });
}

export function SurfaceCharacterController({
  terrain,
  cameraRadius = 4.8,
  cameraMinRadius = 1.75,
  cameraMaxRadius = 12,
  cameraSensitivityX = 0.16,
  cameraSensitivityY = 0.12,
}: SurfaceCharacterControllerProps) {
  const camera = useThree((state) => state.camera);
  const inputRef = useKeyboardInput(true);
  const viewVectorRef = useRef(new Vector3(0, 0, 1));
  const latestStateRef = useRef<SurfaceCharacterMotionState>("falling");
  const speedRef = useRef(0);

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
  const ready = terrain?.ready && Boolean(runtime.surfaceQuery);

  const { groupRef, positionRef, turnRateRef, state } =
    useSurfaceCharacterController({
      inputRef,
      viewVectorRef,
      terrainRuntime: runtime,
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

  useSurfaceThirdPersonCamera({
    targetPositionRef: positionRef,
    terrainRuntime: runtime,
    viewVectorRef,
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
      <ambientLight intensity={1.1} color="#9fb4cc" />
      <group ref={groupRef}>
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
