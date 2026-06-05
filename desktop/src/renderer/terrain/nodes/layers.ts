import { Fn, uint } from "three/tsl";

import type { TerrainUniformNodes } from "./uniforms";

export function createGetMapLayer(uniforms: TerrainUniformNodes) {
  return Fn(([layer]: [ReturnType<typeof uint>]) => {
    return uniforms.uMapLayers.shiftRight(layer).bitAnd(uint(1)).greaterThan(uint(0));
  });
}
