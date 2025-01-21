import React, { useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { HierarchicalSphericalNoise } from "./HierarchicalSphericalNoise";

interface ProgressiveNoiseProps {
  baseRadius?: number;
  maxLevels?: number;
  currentLevel?: number;
  resolution?: number;
  backgroundColor?: { r: number; g: number; b: number; a: number };
  pointColor?: { r: number; g: number; b: number; a: number };
}

export function ProgressiveNoiseTexture({
  baseRadius = 0.2,
  maxLevels = 5,
  currentLevel = 0,
  resolution = 1024,
  backgroundColor = { r: 0, g: 0, b: 0, a: 255 },
  pointColor = { r: 255, g: 255, b: 255, a: 255 },
}: ProgressiveNoiseProps) {
  const [generator, texture] = useMemo(() => {
    const gen = new HierarchicalSphericalNoise({
      baseRadius,
      maxLevels,
      radiusRatio: 0.5,
      k: 30,
      backgroundColor,
      pointColor,
    });

    // Generate all levels up to current
    for (let i = 0; i <= currentLevel; i++) {
      gen.generateLevel(i);
    }

    return [gen, gen.createTextureForLevel(currentLevel, resolution)];
  }, [
    baseRadius,
    maxLevels,
    currentLevel,
    resolution,
    backgroundColor,
    pointColor,
  ]);

  return <meshBasicMaterial map={texture} />;
}
