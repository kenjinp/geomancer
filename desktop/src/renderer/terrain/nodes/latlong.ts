import { Fn, float, length, atan, vec2, vec3 } from "three/tsl";

import { terrainRemap } from "./math";

const RAD2DEG = float(180.0 / Math.PI);

/** Returns vec2(latitude, longitude) in degrees. */
export const getLatLong = Fn(([position]: [ReturnType<typeof vec3>]) => {
  const longitude = atan(position.x, position.z).mul(RAD2DEG);
  const latitude = atan(position.y.negate(), length(position.xz)).mul(RAD2DEG);
  return vec2(latitude, longitude);
});

export const getLatLongUV = Fn(([latLong]: [ReturnType<typeof vec2>]) => {
  return vec2(
    terrainRemap(latLong.y, float(-180), float(180), float(0), float(1)),
    terrainRemap(latLong.x, float(-90), float(90), float(0), float(1)),
  );
});
