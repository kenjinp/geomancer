import { Fn, float, If, mix, vec3, vec4 } from "three/tsl";

import { terrainRemap } from "./math";

const NOAA_ELEVATIONS = [
  8000, 4000, 2000, 1000, 500, 250, 50, 10, 0.1, 0, -2, -10, -50, -250, -1000, -2000, -4000, -8000,
] as const;

const NOAA_COLORS: [number, number, number][] = [
  [1, 1, 1],
  [0.878, 0.843, 0.816],
  [0.804, 0.725, 0.612],
  [0.729, 0.58, 0.408],
  [0.608, 0.494, 0.263],
  [0.459, 0.459, 0.176],
  [0.271, 0.424, 0.094],
  [0.09, 0.333, 0.082],
  [0, 0.251, 0.137],
  [0.878, 0.988, 0.894],
  [0.671, 0.886, 0.843],
  [0.475, 0.776, 0.804],
  [0.361, 0.675, 0.792],
  [0.247, 0.569, 0.78],
  [0.176, 0.459, 0.69],
  [0.133, 0.333, 0.502],
  [0.114, 0.251, 0.322],
  [0.102, 0.204, 0.204],
];

export const getColorForElevation = Fn(([elevation]: [ReturnType<typeof float>]) => {
  const result = vec4(NOAA_COLORS[0][0], NOAA_COLORS[0][1], NOAA_COLORS[0][2], 1.0).toVar();

  If(elevation.greaterThanEqual(float(NOAA_ELEVATIONS[0])), () => {
    result.assign(vec4(NOAA_COLORS[0][0], NOAA_COLORS[0][1], NOAA_COLORS[0][2], 1.0));
  }).ElseIf(elevation.lessThanEqual(float(NOAA_ELEVATIONS[NOAA_ELEVATIONS.length - 1])), () => {
    const last = NOAA_COLORS[NOAA_COLORS.length - 1];
    result.assign(vec4(last[0], last[1], last[2], 1.0));
  }).Else(() => {
    for (let i = 0; i < NOAA_ELEVATIONS.length - 1; i++) {
      const hi = NOAA_ELEVATIONS[i];
      const lo = NOAA_ELEVATIONS[i + 1];
      const cHi = NOAA_COLORS[i];
      const cLo = NOAA_COLORS[i + 1];
      If(elevation.lessThanEqual(float(hi)).and(elevation.greaterThan(float(lo))), () => {
        const t = elevation.sub(float(lo)).div(float(hi - lo));
        result.assign(
          vec4(
            mix(float(cLo[0]), float(cHi[0]), t),
            mix(float(cLo[1]), float(cHi[1]), t),
            mix(float(cLo[2]), float(cHi[2]), t),
            1.0,
          ),
        );
      });
    }
  });

  return result;
});
