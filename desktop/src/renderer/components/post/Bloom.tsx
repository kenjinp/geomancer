import { useControls } from "leva";
import * as React from "react";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";

import { usePostProcessing } from "./PostProcessing";

export interface BloomProps {
  /** Strength of the bloom overspill. */
  strength?: number;
  /** Spread radius of the blur, 0..1. */
  radius?: number;
  /** Luminance threshold above which pixels bloom. */
  threshold?: number;
}

/**
 * Bloom as a standalone post-processing effect.
 *
 * It registers itself onto the shared pipeline's effect chain (see
 * PostProcessing.tsx) as an additive composite — the bright overspill is read
 * from the current image and added back on top of it, so anything above the
 * luminance `threshold` (the sun disk, sun-glint) bleeds into a glowing halo.
 * Bloom works in linear HDR, before the pipeline's final tone map.
 */
export const Bloom: React.FC<BloomProps> = ({
  strength = 0.9,
  radius = 0.6,
  threshold = 1.0,
}) => {
  const { registerEffect } = usePostProcessing();

  const controls = useControls("Bloom", {
    enabled: { value: true },
    strength: { value: strength, min: 0, max: 3, step: 0.05 },
    radius: { value: radius, min: 0, max: 1, step: 0.01 },
    threshold: { value: threshold, min: 0, max: 5, step: 0.05 },
  });

  // The latest control values, read lazily by the effect factory so a pipeline
  // recompose (e.g. when the atmosphere graph rebuilds and the base node
  // changes) rebuilds bloom with current values without re-registering.
  const paramsRef = React.useRef(controls);
  paramsRef.current = controls;

  // The live bloom node. Slider tweaks update its uniforms in place rather than
  // forcing a graph recompile every tick.
  const bloomRef = React.useRef<ReturnType<typeof bloom> | null>(null);

  React.useEffect(() => {
    const unregister = registerEffect("bloom", (input) => {
      bloomRef.current?.dispose();
      const { enabled, strength, radius, threshold } = paramsRef.current;
      const node = bloom(input, strength, radius, threshold);
      node.strength.value = enabled ? strength : 0;
      bloomRef.current = node;
      return input.add(node);
    });
    return () => {
      unregister();
      bloomRef.current?.dispose();
      bloomRef.current = null;
    };
  }, [registerEffect]);

  React.useEffect(() => {
    const node = bloomRef.current;
    if (!node) return;
    node.strength.value = controls.enabled ? controls.strength : 0;
    node.radius.value = controls.radius;
    node.threshold.value = controls.threshold;
  }, [controls]);

  return null;
};
