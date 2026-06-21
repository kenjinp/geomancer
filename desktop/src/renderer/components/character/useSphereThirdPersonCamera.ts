import type { TerrainRuntime } from "@hello-terrain/react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MathUtils, Ray, Vector3 } from "three";

type UseSphereThirdPersonCameraParams = {
  targetPositionRef: MutableRefObject<Vector3>;
  terrainRuntime?: TerrainRuntime;
  /** Forward look direction (tangent to the sphere); written every frame. */
  viewVectorRef: MutableRefObject<Vector3>;
  planetRadius: number;
  planetCenter?: Vector3;
  /** Camera world position at the moment the mode was entered. */
  initialCameraPosition: Vector3;
  /** Height above the character's origin the camera aims at. */
  targetHeight?: number;
  radius?: number;
  minRadius?: number;
  maxRadius?: number;
  sensitivityX?: number;
  sensitivityY?: number;
  enabled?: boolean;
  zoomEnabled?: boolean;
};

export function useSphereThirdPersonCamera({
  targetPositionRef,
  terrainRuntime,
  viewVectorRef,
  planetRadius,
  planetCenter,
  initialCameraPosition,
  targetHeight = 1.15,
  radius = 4.8,
  minRadius = 1.75,
  maxRadius = 12,
  sensitivityX = 0.16,
  sensitivityY = 0.12,
  enabled = true,
  zoomEnabled = true,
}: UseSphereThirdPersonCameraParams) {
  const { camera, gl } = useThree();

  // Pitch of the camera above the tangent plane behind the character (degrees).
  const phiRef = useRef(18);
  const currentRadiusRef = useRef(radius);
  const desiredRadiusRef = useRef(radius);
  // The latest radial up, shared with the mouse handler for yaw rotation.
  const upRef = useRef(new Vector3(0, 1, 0));
  // Pending yaw rotation (radians) accumulated from mouse movement.
  const pendingYawRef = useRef(0);
  const smoothedTargetRef = useRef(new Vector3());
  const smoothedCameraPositionRef = useRef(new Vector3());
  const initializedRef = useRef(false);
  const cameraSeededRef = useRef(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const scratch = useMemo(
    () => ({
      center: new Vector3(),
      up: new Vector3(),
      target: new Vector3(),
      desiredCameraPosition: new Vector3(),
      resolvedCameraPosition: new Vector3(),
      offsetDir: new Vector3(),
      cameraDirection: new Vector3(),
      sampleDir: new Vector3(),
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

    const onPointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === element);
    };

    const onCanvasClick = () => {
      if (document.pointerLockElement !== element) {
        void element.requestPointerLock();
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    element.addEventListener("click", onCanvasClick);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
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

  // Restore the default world up when leaving character mode so OrbitControls
  // (which reads camera.up) behaves normally again.
  useEffect(() => {
    return () => {
      camera.up.set(0, 1, 0);
    };
  }, [camera]);

  useFrame((_state, dt) => {
    if (!enabled) return;
    const delta = Math.min(dt, 1 / 20);

    const center = scratch.center.copy(planetCenter ?? scratch.center.set(0, 0, 0));

    // Radial up at the character.
    scratch.up.copy(targetPositionRef.current).sub(center).normalize();
    upRef.current.copy(scratch.up);

    // Aim point sits a little above the character's origin.
    scratch.target
      .copy(targetPositionRef.current)
      .addScaledVector(scratch.up, targetHeight);

    if (!initializedRef.current) {
      // Inherit the entry camera orientation: derive the look direction from
      // the camera that was active when the mode was entered.
      viewVectorRef.current
        .copy(scratch.target)
        .sub(initialCameraPosition)
        .addScaledVector(
          scratch.up,
          -scratch.target.clone().sub(initialCameraPosition).dot(scratch.up),
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

    // Apply accumulated mouse yaw around the up axis, then re-project the view
    // vector onto the tangent plane (parallel transport as up changes).
    if (pendingYawRef.current !== 0) {
      viewVectorRef.current.applyAxisAngle(scratch.up, pendingYawRef.current);
      pendingYawRef.current = 0;
    }
    viewVectorRef.current.addScaledVector(
      scratch.up,
      -viewVectorRef.current.dot(scratch.up),
    );
    if (viewVectorRef.current.lengthSq() < 1e-6) {
      viewVectorRef.current.set(1, 0, 0).addScaledVector(
        scratch.up,
        -scratch.up.x,
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

    // Camera sits behind the view vector, elevated by phi around the up axis.
    const phiRad = MathUtils.degToRad(phiRef.current);
    scratch.offsetDir
      .copy(viewVectorRef.current)
      .multiplyScalar(-Math.cos(phiRad))
      .addScaledVector(scratch.up, Math.sin(phiRad));
    scratch.desiredCameraPosition
      .copy(smoothedTargetRef.current)
      .addScaledVector(scratch.offsetDir, currentRadiusRef.current);

    scratch.resolvedCameraPosition.copy(scratch.desiredCameraPosition);

    // Pull the camera in if terrain occludes the line from character to camera.
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
        const hit = terrainRaycast.pick(scratch.collisionRay, {
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

    // Keep the camera above the terrain at its own radial location.
    const sphereQuery = terrainRuntime?.sphereQuery;
    if (sphereQuery) {
      scratch.sampleDir
        .copy(scratch.resolvedCameraPosition)
        .sub(center)
        .normalize();
      const sample = sphereQuery.sampleTerrainByDirection(scratch.sampleDir);
      if (sample.valid) {
        const minCameraRadius = planetRadius + sample.elevation + 0.35;
        const cameraRadius = scratch.resolvedCameraPosition.distanceTo(center);
        if (cameraRadius < minCameraRadius) {
          scratch.resolvedCameraPosition
            .copy(center)
            .addScaledVector(scratch.sampleDir, minCameraRadius);
        }
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

  return { isPointerLocked };
}
