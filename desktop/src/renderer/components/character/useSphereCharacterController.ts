import type { TerrainRuntime } from "@hello-terrain/react";
import { useFrame } from "@react-three/fiber";
import { type MutableRefObject, useMemo, useRef, useState } from "react";
import { Group, Matrix4, Quaternion, Ray, Vector3 } from "three";

import type { CharacterInputState } from "./useKeyboardInput";

// Distance from the character's group origin down to the terrain surface, plus
// a small clearance so the feet never intersect the ground. These are absolute
// metres (the planet is Earth-sized), matching the ~1.8 m boxman model.
const CHARACTER_RIDE_HEIGHT = 0.57;
const FOOT_CLEARANCE = 0.03;

const WALK_SPEED = 5.4;
const SPRINT_SPEED = 8.2;
const JUMP_SPEED = 7.1;
const GRAVITY = 18;

export type CharacterMotionState =
  | "idle"
  | "walking"
  | "sprinting"
  | "jumping"
  | "falling";

type UseSphereCharacterControllerParams = {
  inputRef: MutableRefObject<CharacterInputState>;
  /** Forward look direction, kept tangent to the sphere by the camera. */
  viewVectorRef: MutableRefObject<Vector3>;
  terrainRuntime: TerrainRuntime;
  planetRadius: number;
  planetCenter?: Vector3;
  /** Camera world position at the moment the mode was entered. */
  initialCameraPosition: Vector3;
  enabled?: boolean;
  onUpdate?: (snapshot: {
    position: Vector3;
    velocity: Vector3;
    isGrounded: boolean;
    state: CharacterMotionState;
  }) => void;
};

function getMotionState(
  horizontalSpeed: number,
  isGrounded: boolean,
  verticalVelocity: number,
  sprint: boolean,
): CharacterMotionState {
  if (!isGrounded) return verticalVelocity > 0.05 ? "jumping" : "falling";
  if (horizontalSpeed < 0.25) return "idle";
  return sprint ? "sprinting" : "walking";
}

export function useSphereCharacterController({
  inputRef,
  viewVectorRef,
  terrainRuntime,
  planetRadius,
  planetCenter,
  initialCameraPosition,
  enabled = true,
  onUpdate,
}: UseSphereCharacterControllerParams) {
  const groupRef = useRef<Group>(null);
  const positionRef = useRef(new Vector3(0, planetRadius, 0));
  const velocityRef = useRef(new Vector3());
  const isGroundedRef = useRef(false);
  const turnRateRef = useRef(0);
  const previousJumpRef = useRef(false);
  const initializedRef = useRef(false);
  // Unit tangent vector the character is currently facing.
  const headingRef = useRef(new Vector3(0, 0, 1));
  const [state, setState] = useState<CharacterMotionState>("falling");

  const scratch = useMemo(
    () => ({
      center: new Vector3(),
      up: new Vector3(),
      flatView: new Vector3(),
      leftDir: new Vector3(),
      localInput: new Vector3(),
      worldMoveDir: new Vector3(),
      targetVelocity: new Vector3(),
      tangentialVelocity: new Vector3(),
      dir: new Vector3(),
      sampleDir: new Vector3(),
      rayOrigin: new Vector3(),
      downRay: new Ray(),
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
    const center = scratch.center.copy(planetCenter ?? scratch.center.set(0, 0, 0));
    const runtime = terrainRuntime;
    const sphereQuery = runtime.sphereQuery;
    const terrainRaycast = runtime.raycast;

    // Lazily spawn the character on the terrain surface directly beneath the
    // camera position captured when the mode was entered. Deferred to the first
    // enabled frame so the terrain runtime is ready to report ground elevation.
    if (!initializedRef.current) {
      scratch.dir.copy(initialCameraPosition).sub(center);
      if (scratch.dir.lengthSq() < 1e-6) scratch.dir.set(0, 1, 0);
      scratch.dir.normalize();

      let groundRadius = planetRadius;
      if (sphereQuery) {
        const sample = sphereQuery.sampleTerrainByDirection(scratch.dir);
        if (sample.valid) groundRadius = planetRadius + sample.elevation;
      }

      positionRef.current
        .copy(center)
        .addScaledVector(
          scratch.dir,
          groundRadius + CHARACTER_RIDE_HEIGHT + FOOT_CLEARANCE,
        );
      velocityRef.current.set(0, 0, 0);
      isGroundedRef.current = true;

      // Seed the facing direction with any tangent vector.
      scratch.flatView.set(0, 0, 1);
      scratch.flatView.addScaledVector(scratch.dir, -scratch.flatView.dot(scratch.dir));
      if (scratch.flatView.lengthSq() < 1e-6) {
        scratch.flatView.set(1, 0, 0).addScaledVector(scratch.dir, -scratch.dir.x);
      }
      headingRef.current.copy(scratch.flatView).normalize();
      initializedRef.current = true;
    }

    const delta = Math.min(dt, 1 / 20);
    const input = inputRef.current;

    // Radial "up" at the character's current location.
    scratch.up.copy(positionRef.current).sub(center).normalize();

    // Project the camera forward onto the tangent plane to get a heading basis.
    scratch.flatView
      .copy(viewVectorRef.current)
      .addScaledVector(scratch.up, -viewVectorRef.current.dot(scratch.up));
    if (scratch.flatView.lengthSq() < 1e-6) {
      scratch.flatView.copy(headingRef.current);
    }
    scratch.flatView.normalize();
    // Strafe axis: up × forward points to the character's left.
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

    scratch.targetVelocity
      .copy(scratch.worldMoveDir)
      .multiplyScalar(targetSpeed);

    // Split velocity into tangential (movement) and radial (gravity/jump) parts
    // relative to the current up, then blend the tangential part toward input.
    let radialSpeed = velocityRef.current.dot(scratch.up);
    scratch.tangentialVelocity
      .copy(velocityRef.current)
      .addScaledVector(scratch.up, -radialSpeed);

    const horizontalBlend = 1 - Math.exp(-10 * delta);
    scratch.tangentialVelocity.addScaledVector(
      scratch.targetVelocity.sub(scratch.tangentialVelocity),
      horizontalBlend,
    );

    const jumpPressed = input.jump;
    const jumpJustPressed = jumpPressed && !previousJumpRef.current;
    previousJumpRef.current = jumpPressed;

    if (jumpJustPressed && isGroundedRef.current) {
      radialSpeed = JUMP_SPEED;
      isGroundedRef.current = false;
    } else {
      radialSpeed -= GRAVITY * delta;
    }

    velocityRef.current
      .copy(scratch.tangentialVelocity)
      .addScaledVector(scratch.up, radialSpeed);

    positionRef.current.addScaledVector(velocityRef.current, delta);

    // Ground probe along the (updated) radial direction.
    scratch.dir.copy(positionRef.current).sub(center).normalize();
    let groundRadius: number | null = null;

    if (sphereQuery) {
      const sample = sphereQuery.sampleTerrainByDirection(scratch.dir);
      if (sample.valid) groundRadius = planetRadius + sample.elevation;
    }

    if (terrainRaycast) {
      const currentRadius = positionRef.current.distanceTo(center);
      scratch.rayOrigin
        .copy(center)
        .addScaledVector(scratch.dir, currentRadius + 6);
      scratch.downRay.origin.copy(scratch.rayOrigin);
      scratch.downRay.direction.copy(scratch.dir).multiplyScalar(-1);
      const rayHit = terrainRaycast.pick(scratch.downRay, {
        maxSteps: 96,
        refinementSteps: 6,
        maxDistance: 32,
      });
      if (rayHit) groundRadius = rayHit.position.distanceTo(center);
    }

    if (groundRadius != null) {
      const snappedRadius =
        groundRadius + CHARACTER_RIDE_HEIGHT + FOOT_CLEARANCE;
      const currentRadius = positionRef.current.distanceTo(center);
      const radialVelocity = velocityRef.current.dot(scratch.up);
      if (currentRadius <= snappedRadius && radialVelocity <= 0) {
        positionRef.current.copy(center).addScaledVector(scratch.dir, snappedRadius);
        // Kill the radial component of velocity (keep tangential movement).
        velocityRef.current.addScaledVector(
          scratch.up,
          -velocityRef.current.dot(scratch.up),
        );
        isGroundedRef.current = true;
      } else if (currentRadius > snappedRadius + 0.2) {
        isGroundedRef.current = false;
      }
    }

    // Heading: smoothly rotate the facing direction toward the tangential
    // movement direction around the up axis, tracking the turn rate for the
    // model's lean animation.
    scratch.up.copy(positionRef.current).sub(center).normalize();
    scratch.tangentialVelocity
      .copy(velocityRef.current)
      .addScaledVector(scratch.up, -velocityRef.current.dot(scratch.up));
    const horizontalSpeed = scratch.tangentialVelocity.length();

    // Keep the heading tangent as up drifts while walking around the planet.
    scratch.dir.copy(headingRef.current);
    scratch.dir.addScaledVector(scratch.up, -scratch.dir.dot(scratch.up));
    if (scratch.dir.lengthSq() > 1e-6) headingRef.current.copy(scratch.dir).normalize();

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
      headingRef.current
        .applyAxisAngle(scratch.up, stepAngle)
        .normalize();
      turnRateRef.current = stepAngle / Math.max(delta, 1e-4);
    } else {
      turnRateRef.current *= Math.exp(-8 * delta);
    }

    const radialVelocity = velocityRef.current.dot(scratch.up);
    const nextState = getMotionState(
      horizontalSpeed,
      isGroundedRef.current,
      radialVelocity,
      input.sprint,
    );
    if (nextState !== state) setState(nextState);

    if (groupRef.current) {
      groupRef.current.position.copy(positionRef.current);
      // Orient so local +Y is the radial up and local +Z faces the heading.
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
