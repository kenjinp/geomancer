import React, { useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TileableBlueNoise } from "./TileableBlueNoise"; // Import from previous code

interface BlueNoiseTextureProps {
  radius?: number;
  resolution?: number;
  periodicity?: boolean;
  repeat?: number;
}

// Optional: Export a component that uses the texture as a material
export function BlueNoiseMaterial({
  radius = 1,
  resolution = 64,
  periodicity = true,
  repeat = 1,
}: BlueNoiseTextureProps) {
  const texture = useMemo(() => {
    const generator = new TileableBlueNoise({
      width: 1,
      height: 1,
      radius,
      visualRadius: radius * 0.5,
      k: 50,
      periodicity,
    });

    generator.generate();
    const t = generator.createTexture(resolution);
    t.repeat.set(repeat, repeat);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  }, [radius, resolution, periodicity, repeat]);

  return <meshBasicMaterial map={texture} />;
}
