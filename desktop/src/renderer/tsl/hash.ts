import { float, Fn, fract, sin, vec3 } from "three/tsl";

/**
 * Hashes an integer into a deterministic vec3 color in the [0, 1] range.
 *
 * Decorrelates the input across three channels with distinct prime-ish
 * multipliers, then folds the result into the unit range via fract(sin()).
 * @param id - integer-valued node to hash
 */
export const hashColor = Fn(([id]: [any]) => {
  const n = float(id).add(1).toVar();
  const r = fract(sin(n.mul(12.9898)).mul(43758.5453));
  const g = fract(sin(n.mul(78.233)).mul(24634.6345));
  const b = fract(sin(n.mul(39.425)).mul(15731.7431));
  return vec3(r, g, b);
});
