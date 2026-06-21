import { dot, float, floor, Fn, fract, Loop, mix, normalize, sin, vec3 } from "three/tsl";

const randomGradient = Fn(([p]: [any]) => {
  const x = dot(p, vec3(127.1, 311.7, 74.7));
  const y = dot(p, vec3(269.5, 183.3, 246.1));
  const z = dot(p, vec3(113.5, 271.9, 124.6));
  return normalize(
    fract(sin(vec3(x, y, z)).mul(43758.5453))
      .mul(2)
      .sub(1),
  );
});

const perlinNoise = Fn(([p]: [any]) => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));

  const g000 = randomGradient(i.add(vec3(0, 0, 0)));
  const g100 = randomGradient(i.add(vec3(1, 0, 0)));
  const g010 = randomGradient(i.add(vec3(0, 1, 0)));
  const g110 = randomGradient(i.add(vec3(1, 1, 0)));
  const g001 = randomGradient(i.add(vec3(0, 0, 1)));
  const g101 = randomGradient(i.add(vec3(1, 0, 1)));
  const g011 = randomGradient(i.add(vec3(0, 1, 1)));
  const g111 = randomGradient(i.add(vec3(1, 1, 1)));

  const d000 = dot(g000, f.sub(vec3(0, 0, 0)));
  const d100 = dot(g100, f.sub(vec3(1, 0, 0)));
  const d010 = dot(g010, f.sub(vec3(0, 1, 0)));
  const d110 = dot(g110, f.sub(vec3(1, 1, 0)));
  const d001 = dot(g001, f.sub(vec3(0, 0, 1)));
  const d101 = dot(g101, f.sub(vec3(1, 0, 1)));
  const d011 = dot(g011, f.sub(vec3(0, 1, 1)));
  const d111 = dot(g111, f.sub(vec3(1, 1, 1)));

  const x00 = mix(d000, d100, u.x);
  const x10 = mix(d010, d110, u.x);
  const x01 = mix(d001, d101, u.x);
  const x11 = mix(d011, d111, u.x);

  const y0 = mix(x00, x10, u.y);
  const y1 = mix(x01, x11, u.y);

  return mix(y0, y1, u.z).add(0.5);
});

/** Six-octave fractal Brownian motion over a 3D position node. */
/**
 * Parameterized fractal Brownian motion over a 3D position node.
 * @param pos - position (vec3)
 * @param octaves - number of noise layers
 * @param baseAmp - starting amplitude
 * @param baseFreq - starting frequency
 * @param freqMult - frequency multiplier per octave
 * @param ampMult - amplitude multiplier per octave
 */
export const fbm = Fn(([
  pos, 
  octaves = 6, 
  baseAmp = 0.5, 
  baseFreq = 1.0, 
  freqMult = 2.03, 
  ampMult = 0.5
]: [any, number?, number?, number?, number?, number?]) => {
  const p = vec3(pos).toVar();
  const total = float(0).toVar();
  const amp = float(baseAmp).toVar();
  const freq = float(baseFreq).toVar();

  Loop(octaves, () => {
    total.addAssign(perlinNoise(p.mul(freq)).mul(amp));
    freq.mulAssign(freqMult);
    amp.mulAssign(ampMult);
  });

  return total;
});
