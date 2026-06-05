import {
  Fn,
  acos,
  bitXor,
  clamp,
  dot,
  float,
  floor,
  normalize,
  select,
  shiftLeft,
  shiftRight,
  uint,
  vec3,
} from "three/tsl";

/** WGSL needs f32; convert uint tile/H3 ids to float. Helpers below carry explicit
 *  node types so `float()` actually emits `f32(...)` instead of leaving a u32. */
export const toFloat = (value: ReturnType<typeof float> | ReturnType<typeof uint>) => float(value);

export const terrainRemap = Fn(
  ([value, x1, y1, x2, y2]: [
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    return value.sub(x1).mul(x2.sub(y2)).div(y1.sub(x1)).add(y2);
  },
);

export const greatCircleDistance = Fn(([a, b]: [ReturnType<typeof vec3>, ReturnType<typeof vec3>]) => {
  const na = normalize(a);
  const nb = normalize(b);
  const cosTheta = clamp(dot(na, nb), float(-1.0), float(1.0));
  return acos(cosTheta);
});

export const hashFloat = Fn(([f]: [ReturnType<typeof float>]) => {
  const seed = uint(floor(f));
  const s1 = bitXor(seed, shiftLeft(seed, uint(13)));
  const s2 = bitXor(s1, shiftRight(s1, uint(17)));
  const s3 = bitXor(s2, shiftLeft(s2, uint(5)));
  return vec3(
    float(shiftRight(s3, uint(16)).bitAnd(uint(0xff))).div(255.0),
    float(shiftRight(s3, uint(8)).bitAnd(uint(0xff))).div(255.0),
    float(s3.bitAnd(uint(0xff))).div(255.0),
  );
});

/** Returns a float id. Conversion happens here where `packed` is provably uint,
 *  so the f32 cast lands in WGSL and the id crosses the Fn boundary as f32. */
export const packH3IdFromRgb = Fn(([color]: [ReturnType<typeof vec3>]) => {
  const r = uint(floor(color.r.mul(255.0).add(0.5)));
  const g = uint(floor(color.g.mul(255.0).add(0.5)));
  const b = uint(floor(color.b.mul(255.0).add(0.5)));
  const invalid = r.equal(uint(255)).and(g.equal(uint(255))).and(b.equal(uint(255)));
  const packed = r.shiftLeft(uint(16)).bitOr(g.shiftLeft(uint(8))).bitOr(b);
  return float(select(invalid, uint(0), packed)).toVar();
}, "float");
