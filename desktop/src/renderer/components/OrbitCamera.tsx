import type { TerrainHandle } from "@hello-terrain/react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { MathUtils, Ray, Spherical, Vector3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface OrbitCameraProps {
  planetRadius: number;
  planetPosition?: Vector3;
  maxAltitudeOffset?: number;
  maxDistanceMultiplier?: number;
  defaultCameraPosition?: Vector3;
  /** Terrain handle used to raycast the true ground elevation beneath the camera. */
  terrain?: TerrainHandle;
  /**
   * Maps the camera's altitude-above-terrain (expressed as a fraction of its
   * distance to the planet center) to a zoom speed. Larger = zooms faster at
   * every height.
   */
  zoomSpeedScale?: number;
  /** As {@link OrbitCameraProps.zoomSpeedScale}, but for orbit/rotate speed. */
  rotateSpeedScale?: number;
  /** Lower clamp on zoom speed (keeps zoom usable at very low altitude). */
  minZoomSpeed?: number;
  /** Upper clamp on zoom speed (caps zoom at very high altitude). */
  maxZoomSpeed?: number;
  /** Lower clamp on rotate speed (keeps rotation usable at very low altitude). */
  minRotateSpeed?: number;
  /** Upper clamp on rotate speed. */
  maxRotateSpeed?: number;
}

function easeOutExpo(x: number): number {
  return x === 1 ? 1 : 1 - Math.pow(4, -10 * x);
}

// Reused each frame to avoid per-frame allocations while probing ground height.
const groundRay = new Ray();
// Scratch vectors reused by the terrain-collision clamp.
const radialOffset = new Vector3();
const radialDir = new Vector3();

interface AnimationState {
  isAnimating: boolean;
  startPosition: Vector3;
  targetPosition: Vector3;
  startRotation: Spherical;
  targetRotation: Spherical;
  progress: number;
  duration: number;
}

export const OrbitCamera: React.FC<React.PropsWithChildren<OrbitCameraProps>> = ({
  planetRadius,
  planetPosition = new Vector3(),
  maxAltitudeOffset = 100,
  maxDistanceMultiplier = 4,
  defaultCameraPosition,
  terrain,
  minZoomSpeed = 0.00000025,
  maxZoomSpeed = 0.5,
  minRotateSpeed = 0.0000025,
  maxRotateSpeed = 0.5,
  children,
}) => {
  const orbitControls = React.useRef<OrbitControlsImpl>(null);
  const altitude = React.useRef(0);
  const isUserInteracting = React.useRef(false);
  const animation = React.useRef<AnimationState>({
    isAnimating: false,
    startPosition: new Vector3(),
    targetPosition: new Vector3(),
    startRotation: new Spherical(),
    targetRotation: new Spherical(),
    progress: 0,
    duration: 1000,
  });

  const { camera, set } = useThree();

  React.useEffect(() => {
    camera.position.copy(
      defaultCameraPosition || new Vector3(planetRadius * 1.5, 0, planetRadius * 1.5),
    );
  }, [planetRadius]);

  const moveToTarget = React.useCallback(
    (targetPoint: Vector3, duration = 5000) => {
      if (!orbitControls.current) return;

      // Disable controls during animation
      orbitControls.current.enabled = false;

      // Calculate current distance from planet surface
      const currentDistance = camera.position.distanceTo(planetPosition) - planetRadius;

      // Calculate target camera position
      const directionToTarget = targetPoint.clone().sub(planetPosition).normalize();
      const targetPosition = directionToTarget
        .multiplyScalar(planetRadius + currentDistance)
        .add(planetPosition);

      // Calculate spherical coordinates
      const startSpherical = new Spherical().setFromVector3(
        camera.position.clone().sub(planetPosition),
      );
      const targetSpherical = new Spherical().setFromVector3(
        targetPosition.clone().sub(planetPosition),
      );

      // Set up animation state
      animation.current = {
        isAnimating: true,
        startPosition: camera.position.clone(),
        targetPosition: targetPosition,
        startRotation: startSpherical,
        targetRotation: targetSpherical,
        progress: 0,
        duration,
      };
    },
    [planetPosition, planetRadius],
  );

  window.moveToTarget = moveToTarget;

  // React.useEffect(() => {
  //   set({
  //     moveToTarget,
  //   });
  // }, [moveToTarget]);

  // Add event listeners for user interaction
  React.useEffect(() => {
    const handleInteractionStart = () => {
      isUserInteracting.current = true;
    };
    const handleInteractionEnd = () => {
      isUserInteracting.current = false;
    };

    window.addEventListener("mousedown", handleInteractionStart);
    window.addEventListener("mouseup", handleInteractionEnd);
    window.addEventListener("wheel", handleInteractionStart);

    return () => {
      window.removeEventListener("mousedown", handleInteractionStart);
      window.removeEventListener("mouseup", handleInteractionEnd);
      window.removeEventListener("wheel", handleInteractionStart);
    };
  }, []);

  // Altitude of the camera above the terrain surface directly below it.
  // Falls back to altitude above sea level when the terrain raycaster isn't
  // ready yet, or when the camera is looking out into space past the horizon.
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

  // Prevents the camera from passing through the planet's surface. Probes the
  // terrain elevation directly beneath the camera (along its radial direction)
  // and, if the camera is closer to the center than the surface plus the
  // required clearance, pushes it back out radially. Mountains can rise far
  // above the sphere datum, so a static `minDistance` alone is insufficient.
  const clampAboveTerrain = React.useCallback(() => {
    radialOffset.copy(camera.position).sub(planetPosition);
    const distance = radialOffset.length();
    if (distance === 0) return;
    radialDir.copy(radialOffset).divideScalar(distance);

    // Radial terrain height under the camera (already scaled to world units);
    // falls back to the sphere datum until the terrain query is ready.
    const elevation =
      terrain?.runtime.sphereQuery?.getElevationByDirection(radialDir) ?? 0;
    const minDistance = planetRadius + elevation + maxAltitudeOffset;

    if (distance < minDistance) {
      camera.position.copy(planetPosition).addScaledVector(radialDir, minDistance);
    }
  }, [camera, planetPosition, planetRadius, maxAltitudeOffset, terrain]);

  useFrame((_, delta) => {
    if (!orbitControls.current) return;

    // Stop animation if user interacts
    if (animation.current.isAnimating && isUserInteracting.current) {
      animation.current.isAnimating = false;
      orbitControls.current.enabled = true;
    }

    if (animation.current.isAnimating && !isUserInteracting.current) {
      animation.current.progress += (delta * 1000) / animation.current.duration;

      if (animation.current.progress >= 1) {
        animation.current.isAnimating = false;
        orbitControls.current.enabled = true;
        return;
      }

      // Smooth easing function
      const t = easeOutExpo(animation.current.progress);

      // Interpolate position
      camera.position.lerpVectors(
        animation.current.startPosition,
        animation.current.targetPosition,
        t,
      );

      // Interpolate rotation
      const currentSpherical = new Spherical(
        MathUtils.lerp(
          animation.current.startRotation.radius,
          animation.current.targetRotation.radius,
          t,
        ),
        MathUtils.lerp(
          animation.current.startRotation.phi,
          animation.current.targetRotation.phi,
          t,
        ),
        MathUtils.lerp(
          animation.current.startRotation.theta,
          animation.current.targetRotation.theta,
          t,
        ),
      );

      // Update camera rotation
      const targetRotation = new Vector3().setFromSpherical(currentSpherical);
      camera.position.lerp(targetRotation, t);
      camera.lookAt(planetPosition);
    } else {
      altitude.current = getAltitudeAboveTerrain();

      const maxAltitude = planetRadius * maxDistanceMultiplier;
      const speedRatio = MathUtils.clamp(altitude.current / maxAltitude, 0, 1)

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
    }

    // Runs after the orbit-controls update (registered earlier) and during
    // fly-to animations, so the camera can never end a frame below the terrain.
    clampAboveTerrain();
  });

  React.useEffect(() => {
    set({ controls: orbitControls.current });
  }, [orbitControls.current]);

  return (
    <OrbitControls
      ref={orbitControls}
      enablePan={false}
      enableZoom
      maxDistance={planetRadius * maxDistanceMultiplier}
      minDistance={planetRadius + maxAltitudeOffset}
    >
      {children}
    </OrbitControls>
  );
};
