import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { MathUtils, Spherical, Vector3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface OrbitCameraProps {
  planetRadius: number;
  planetPosition?: Vector3;
  maxAltitudeOffset?: number;
  maxDistanceMultiplier?: number;
  defaultCameraPosition?: Vector3;
}

const quadtratic = (t: number) => t * (-(t * t) * t + 4 * t * t - 6 * t + 4);
function easeOutExpo(x: number): number {
  return x === 1 ? 1 : 1 - Math.pow(4, -10 * x);
}

interface AnimationState {
  isAnimating: boolean;
  startPosition: Vector3;
  targetPosition: Vector3;
  startRotation: Spherical;
  targetRotation: Spherical;
  progress: number;
  duration: number;
}

export const OrbitCamera: React.FC<
  React.PropsWithChildren<OrbitCameraProps>
> = ({
  planetRadius,
  planetPosition = new Vector3(),
  maxAltitudeOffset = 100,
  maxDistanceMultiplier = 10,
  defaultCameraPosition,
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
      defaultCameraPosition ||
        new Vector3(planetRadius * 1.5, 0, planetRadius * 1.5)
    );
  }, [planetRadius]);

  const moveToTarget = React.useCallback(
    (targetPoint: Vector3, duration = 5000) => {
      if (!orbitControls.current) return;

      // Disable controls during animation
      orbitControls.current.enabled = false;

      // Calculate current distance from planet surface
      const currentDistance =
        camera.position.distanceTo(planetPosition) - planetRadius;

      // Calculate target camera position
      const directionToTarget = targetPoint
        .clone()
        .sub(planetPosition)
        .normalize();
      const targetPosition = directionToTarget
        .multiplyScalar(planetRadius + currentDistance)
        .add(planetPosition);

      // Calculate spherical coordinates
      const startSpherical = new Spherical().setFromVector3(
        camera.position.clone().sub(planetPosition)
      );
      const targetSpherical = new Spherical().setFromVector3(
        targetPosition.clone().sub(planetPosition)
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
    [planetPosition, planetRadius]
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
        t
      );

      // Interpolate rotation
      const currentSpherical = new Spherical(
        MathUtils.lerp(
          animation.current.startRotation.radius,
          animation.current.targetRotation.radius,
          t
        ),
        MathUtils.lerp(
          animation.current.startRotation.phi,
          animation.current.targetRotation.phi,
          t
        ),
        MathUtils.lerp(
          animation.current.startRotation.theta,
          animation.current.targetRotation.theta,
          t
        )
      );

      // Update camera rotation
      const targetRotation = new Vector3().setFromSpherical(currentSpherical);
      camera.position.lerp(targetRotation, t);
      camera.lookAt(planetPosition);
    } else {
      // Normal orbit controls behavior
      altitude.current =
        camera.position.distanceTo(planetPosition) - planetRadius || 0;
      orbitControls.current.zoomSpeed = easeOutExpo(
        altitude.current / orbitControls.current.maxDistance
      );
      orbitControls.current.rotateSpeed = quadtratic(
        altitude.current / orbitControls.current.maxDistance
      );
    }
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
