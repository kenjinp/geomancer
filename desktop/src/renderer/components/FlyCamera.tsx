import type { TerrainHandle } from "@hello-terrain/react";
import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { MathUtils, Ray, Vector3 } from "three";

export interface FlyCameraProps {
  planetRadius: number;
  planetPosition?: Vector3;
  /** Minimum clearance (world units) the camera keeps above the terrain. */
  maxAltitudeOffset?: number;
  /** Upper bound on how far the camera may drift from the planet centre. */
  maxDistanceMultiplier?: number;
  /** Terrain handle used to keep the camera above the true ground elevation. */
  terrain?: TerrainHandle;
  /** Mouse-look sensitivity (radians of rotation per pixel of mouse movement). */
  lookSensitivity?: number;
  /**
   * Movement speed expressed as a fraction of the camera's altitude-above-terrain
   * traversed per second. Scaling with altitude keeps the controls usable both
   * when skimming mountains and when cruising in orbit.
   */
  moveSpeedScale?: number;
  /** Lower clamp on movement speed (world units / second). */
  minMoveSpeed?: number;
  /** Upper clamp on movement speed (world units / second). */
  maxMoveSpeed?: number;
  /** Roll speed for the Q/E keys (radians / second). */
  rollSpeed?: number;
}

// Reused each frame to avoid per-frame allocations while probing ground height.
const groundRay = new Ray();
// Scratch vectors reused by the terrain-collision clamp and movement maths.
const radialOffset = new Vector3();
const radialDir = new Vector3();
const forward = new Vector3();
const right = new Vector3();
const moveDelta = new Vector3();

export const FlyCamera: React.FC<FlyCameraProps> = ({
  planetRadius,
  planetPosition = new Vector3(),
  maxAltitudeOffset = 0.5,
  maxDistanceMultiplier = 4,
  terrain,
  lookSensitivity = 0.0025,
  moveSpeedScale = 1.5,
  minMoveSpeed = 5,
  maxMoveSpeed = planetRadius * 0.5,
  rollSpeed = 1.5,
}) => {
  const { camera, gl } = useThree();

  // Pressed-key set, mutated by the keyboard listeners and read each frame.
  const keys = React.useRef<Set<string>>(new Set());
  // Whether the pointer is currently locked (drives mouse-look).
  const isLocked = React.useRef(false);
  // Speed multiplier while the boost key (Shift) is held.
  const boost = React.useRef(1);

  // Point the camera at the planet on entry so the user starts facing the
  // surface rather than off into empty space.
  React.useEffect(() => {
    camera.lookAt(planetPosition);
  }, [camera, planetPosition]);

  // Pointer-lock based mouse look. Clicking the canvas captures the pointer;
  // Escape (or losing focus) releases it.
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

      // Yaw around the local "up" (the planet radial) so the horizon stays
      // level, and pitch around the camera's own right axis.
      radialOffset.copy(camera.position).sub(planetPosition);
      const distance = radialOffset.length();
      if (distance === 0) return;
      radialDir.copy(radialOffset).divideScalar(distance);

      camera.rotateOnWorldAxis(radialDir, -event.movementX * lookSensitivity);
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
  }, [camera, gl, lookSensitivity, planetPosition]);

  // Keyboard movement state.
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

  // Altitude of the camera above the terrain surface directly below it. Falls
  // back to altitude above the sphere datum when the raycaster isn't ready.
  const getAltitudeAboveTerrain = React.useCallback(() => {
    const sphereAltitude = Math.max(
      camera.position.distanceTo(planetPosition) - planetRadius,
      0,
    );

    const raycast = terrain?.runtime.raycast;
    if (!raycast) return sphereAltitude;

    groundRay.origin.copy(camera.position);
    groundRay.direction.copy(planetPosition).sub(camera.position).normalize();

    const hit = raycast.pick(groundRay);
    return hit ? hit.distance : sphereAltitude;
  }, [camera, planetPosition, planetRadius, terrain]);

  // Keeps the camera above the terrain (and below the max distance). Probes the
  // terrain elevation along the camera's radial direction and pushes the camera
  // back out if it would dip below the required clearance.
  const clampToShell = React.useCallback(() => {
    radialOffset.copy(camera.position).sub(planetPosition);
    const distance = radialOffset.length();
    if (distance === 0) return;
    radialDir.copy(radialOffset).divideScalar(distance);

    const elevation =
      terrain?.runtime.sphereQuery?.getElevationByDirection(radialDir) ?? 0;
    const minDistance = planetRadius + elevation + maxAltitudeOffset;
    const maxDistance = planetRadius * maxDistanceMultiplier;

    if (distance < minDistance) {
      camera.position.copy(planetPosition).addScaledVector(radialDir, minDistance);
    } else if (distance > maxDistance) {
      camera.position.copy(planetPosition).addScaledVector(radialDir, maxDistance);
    }
  }, [camera, planetPosition, planetRadius, maxAltitudeOffset, maxDistanceMultiplier, terrain]);

  useFrame((_, delta) => {
    const altitude = getAltitudeAboveTerrain();

    // Speed scales with altitude so the camera covers ground quickly at high
    // altitude and finely near the surface, then clamps to a usable range.
    const speed =
      MathUtils.clamp(altitude * moveSpeedScale, minMoveSpeed, maxMoveSpeed) *
      boost.current *
      delta;

    camera.getWorldDirection(forward);

    // "Up" is the planet radial; right is perpendicular to both.
    radialOffset.copy(camera.position).sub(planetPosition);
    const distance = radialOffset.length();
    radialDir.copy(radialOffset).divideScalar(distance || 1);
    right.copy(forward).cross(radialDir).normalize();

    moveDelta.set(0, 0, 0);
    const k = keys.current;
    if (k.has("KeyW") || k.has("ArrowUp")) moveDelta.addScaledVector(forward, 1);
    if (k.has("KeyS") || k.has("ArrowDown")) moveDelta.addScaledVector(forward, -1);
    if (k.has("KeyD") || k.has("ArrowRight")) moveDelta.addScaledVector(right, 1);
    if (k.has("KeyA") || k.has("ArrowLeft")) moveDelta.addScaledVector(right, -1);
    if (k.has("Space")) moveDelta.addScaledVector(radialDir, 1);
    if (k.has("KeyC") || k.has("ControlLeft")) moveDelta.addScaledVector(radialDir, -1);

    if (moveDelta.lengthSq() > 0) {
      moveDelta.normalize().multiplyScalar(speed);
      camera.position.add(moveDelta);
    }

    // Roll around the camera's own forward (view) axis.
    if (k.has("KeyQ")) camera.rotateZ(rollSpeed * delta);
    if (k.has("KeyE")) camera.rotateZ(-rollSpeed * delta);

    clampToShell();
  });

  return null;
};
