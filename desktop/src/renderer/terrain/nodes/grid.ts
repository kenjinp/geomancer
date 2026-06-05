import { abs, float, Fn, fract, fwidth, min, sub } from "three/tsl";

export const getGrid = Fn(
  ([localPosition, size, thickness]: [
    ReturnType<typeof import("three/tsl").vec2>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const r = localPosition.div(size);
    const grid = abs(fract(r.sub(0.5)).sub(0.5)).div(fwidth(r));
    const line = min(grid.x, grid.y).add(1.0).sub(thickness);
    return float(1.0).sub(min(line, float(1.0)));
  },
);

export const getGridFromFloat = Fn(
  ([localPosition, size, thickness]: [
    ReturnType<typeof float>,
    ReturnType<typeof float>,
    ReturnType<typeof float>,
  ]) => {
    const r = localPosition.div(size);
    const grid = abs(fract(r.sub(0.5)).sub(0.5)).div(fwidth(r));
    const line = grid.add(1.0).sub(thickness);
    return float(1.0).sub(min(line, float(1.0)));
  },
);
