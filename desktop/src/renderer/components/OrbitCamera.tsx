import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { Vector3 } from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface OrbitCameraProps {
  planetRadius: number;
  planetPosition: Vector3;
  maxAltitudeOffset?: number;
  maxDistanceMultiplier?: number;
  defaultCameraPosition?: Vector3;
}

// TODO put into some easing library / utils
const quadtratic = (t: number) => t * (-(t * t) * t + 4 * t * t - 6 * t + 4);
function easeOutExpo(x: number): number {
  return x === 1 ? 1 : 1 - Math.pow(4, -10 * x);
}

export const OrbitCamera: React.FC<
  React.PropsWithChildren<OrbitCameraProps>
> = ({
  planetRadius,
  planetPosition,
  maxAltitudeOffset = 100,
  maxDistanceMultiplier = 10,
  defaultCameraPosition,
  children,
}) => {
  const orbitControls = React.useRef<OrbitControlsImpl>(null);
  const altitude = React.useRef(0);

  const { camera, set } = useThree();

  React.useEffect(() => {
    camera.position.copy(
      defaultCameraPosition ||
        new Vector3(planetRadius * 1.5, 0, planetRadius * 1.5)
    );
  }, [planetRadius]);

  useFrame(() => {
    if (!orbitControls.current) {
      return;
    }
    altitude.current =
      camera.position.distanceTo(planetPosition) - planetRadius || 0;
    orbitControls.current.zoomSpeed = easeOutExpo(
      altitude.current / orbitControls.current.maxDistance
    );

    orbitControls.current.rotateSpeed = quadtratic(
      altitude.current / orbitControls.current.maxDistance
    );
    set({ controls: orbitControls.current });
  });

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
