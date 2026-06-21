import { useControls } from "leva";
import * as React from "react";
import * as THREE from "three/webgpu";

import { AU, SUN_RADIUS } from "@/constants";

export interface SunProps {
  /** Normalised direction from the planet centre toward the sun. */
  direction: THREE.Vector3;
}

/**
 * The visible solar disk.
 *
 * This is purely a bright, unlit billboard of geometry — the actual surface
 * lighting is handled by the `directionalLight` in TerrainRenderer (adding a
 * second light here would split the planet's terminator, see Canvas.tsx). Its
 * only job is to give bloom something to feed on: the emissive colour is pushed
 * well above 1.0 in linear space so it clears the bloom luminance threshold and
 * blooms into a glowing halo.
 */
export const Sun: React.FC<SunProps> = ({ direction }) => {
  const { brightness, color, distance, radius } = useControls("Sun", {
    brightness: { value: 12, min: 0, max: 60, step: 0.5 },
    color: "#fff4e0",
    distance: { value: AU, min: AU / 50, max: AU * 2, step: AU / 100 },
    radius: { value: SUN_RADIUS, min: SUN_RADIUS / 10, max: SUN_RADIUS * 10 },
  });

  const position = React.useMemo<[number, number, number]>(() => {
    const p = direction.clone().normalize().multiplyScalar(distance);
    return [p.x, p.y, p.z];
  }, [direction, distance]);

  return (
    <mesh position={position} frustumCulled={false}>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshStandardMaterial
        color="#000000"
        emissive={color}
        emissiveIntensity={brightness}
        toneMapped={false}
      />
    </mesh>
  );
};
