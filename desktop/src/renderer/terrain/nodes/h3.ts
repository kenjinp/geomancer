import {
  Fn,
  Loop,
  abs,
  float,
  floor,
  int,
  min,
  mod,
  dot,
  normalize,
  smoothstep,
  textureSize,
  uint,
  vec2,
  vec3,
} from "three/tsl";

import { greatCircleDistance, packH3IdFromRgb } from "./math";
import type { TerrainUniformNodes } from "./uniforms";

export function createH3Nodes(uniforms: TerrainUniformNodes) {
  const applyJitter = uniforms.uApplyHexJitter;

  // All H3 ids are passed around as float. uint is used only locally for bit
  // unpacking, and converted to float before crossing any Fn boundary so WGSL
  // never tries `u32 / f32` style mixed arithmetic.
  const getNeighborH3Id = Fn(([baseId, direction]: [ReturnType<typeof float>, ReturnType<typeof float>]) => {
    const index = float(baseId).mul(6.0).add(float(direction)).toVar();
    const texSize = textureSize(uniforms.h3NeighborMap, 0);
    const texWidth = float(texSize.x);
    const texHeight = float(texSize.y);
    const row = floor(index.div(texWidth));
    const col = mod(index, texWidth);
    const uv = vec2(col.add(0.5).div(texWidth), row.add(0.5).div(texHeight));
    const packed = uniforms.h3NeighborMap.sample(uv);
    const r = uint(floor(packed.r.mul(255.0).add(0.5)));
    const g = uint(floor(packed.g.mul(255.0).add(0.5)));
    const b = uint(floor(packed.b.mul(255.0).add(0.5)));
    const invalid = r.equal(uint(255)).and(g.equal(uint(255))).and(b.equal(uint(255)));
    return float(invalid.select(uint(0), r.shiftLeft(uint(16)).bitOr(g.shiftLeft(uint(8))).bitOr(b))).toVar();
  }, "float");

  const jitterPosition = Fn(
    ([position, seed, amount]: [ReturnType<typeof vec3>, ReturnType<typeof float>, ReturnType<typeof float>]) => {
      const noiseInput = position.add(vec3(seed.mul(0.1234), seed.mul(0.5678), seed.mul(0.9012)));
      const p = noiseInput.mul(vec3(0.1031, 0.103, 0.0973)).fract();
      p.add(dot(p, p.yzx.add(33.33)));
      const random = vec3(
        p.x.add(p.y).mul(p.z).fract(),
        p.y.add(p.z).mul(p.x).fract(),
        p.z.add(p.x).mul(p.y).fract(),
      )
        .mul(2.0)
        .sub(1.0);
      return normalize(position.add(random.mul(amount)));
    },
    "vec3",
  );

  const getH3Position = Fn(
    ([h3Id, jitterAmount]: [ReturnType<typeof float>, ReturnType<typeof float>]) => {
      const id = float(h3Id).toVar();
      const texSize = textureSize(uniforms.h3PositionMap, 0);
      const texWidth = float(texSize.x);
      const texHeight = float(texSize.y);
      const row = floor(id.div(texWidth));
      const col = id.sub(row.mul(texWidth));
      const safeRow = min(row, texHeight.sub(1.0));
      const uv = vec2(col.add(0.5).div(texWidth), safeRow.add(0.5).div(texHeight));
      const position = uniforms.h3PositionMap.sample(uv).xyz;
      return applyJitter.equal(uint(1)).select(
        jitterPosition(position, id, jitterAmount),
        position,
      );
    },
    "vec3",
  );

  const getH3IdentifierCube = Fn(([direction]: [ReturnType<typeof vec3>]) => {
    const color = uniforms.h3IndexMap.sample(direction);
    return packH3IdFromRgb(color);
  }, "float");

  const findClosestAndSecondClosestCell = Fn(
    ([position, initialId, jitterAmount]: [ReturnType<typeof vec3>, ReturnType<typeof float>, ReturnType<typeof float>]) => {
      const normalizedPos = normalize(position);
      const initialCenter = normalize(getH3Position(initialId, jitterAmount));
      const minDist = greatCircleDistance(normalizedPos, initialCenter).toVar();
      const secondMinDist = float(1000.0).toVar();
      const closestId = float(initialId).toVar();
      const secondClosestId = float(initialId).toVar();

      Loop({ start: int(0), end: int(6), type: "int", condition: "<" }, ({ i }) => {
        const neighborId = getNeighborH3Id(initialId, float(i)).toVar();
        const valid = neighborId.equal(float(0)).not();
        const neighborCenter = normalize(getH3Position(neighborId, jitterAmount));
        const dist = greatCircleDistance(normalizedPos, neighborCenter);
        const isCloser = dist.lessThan(minDist).and(valid);
        secondMinDist.assign(isCloser.select(minDist, secondMinDist));
        secondClosestId.assign(isCloser.select(closestId, secondClosestId));
        minDist.assign(isCloser.select(dist, minDist));
        closestId.assign(isCloser.select(neighborId, closestId));
        const isSecond = dist.lessThan(secondMinDist).and(valid).and(isCloser.not());
        secondMinDist.assign(isSecond.select(dist, secondMinDist));
        secondClosestId.assign(isSecond.select(neighborId, secondClosestId));
      });

      return vec2(closestId, secondClosestId);
    },
    "vec2",
  );

  const getEdgeFactor = Fn(
    ([position, cellId, jitterAmount, edgeWidth]: [
      ReturnType<typeof vec3>,
      ReturnType<typeof float>,
      ReturnType<typeof float>,
      ReturnType<typeof float>,
    ]) => {
      const normalizedPos = normalize(position);
      const cellCenter = normalize(getH3Position(cellId, jitterAmount));
      const distToCenter = greatCircleDistance(normalizedPos, cellCenter);
      const minNeighborDist = float(1000.0).toVar();

      Loop({ start: int(0), end: int(6), type: "int", condition: "<" }, ({ i }) => {
        const neighborId = getNeighborH3Id(cellId, float(i)).toVar();
        const valid = neighborId.equal(float(0)).not();
        const neighborCenter = normalize(getH3Position(neighborId, jitterAmount));
        const dist = greatCircleDistance(normalizedPos, neighborCenter);
        minNeighborDist.assign(valid.select(min(minNeighborDist, dist), minNeighborDist));
      });

      const edgeFactor = abs(distToCenter.sub(minNeighborDist));
      return float(1.0).sub(smoothstep(float(0.0), edgeWidth, edgeFactor.mul(float(4.0))));
    },
    "float",
  );

  return {
    getNeighborH3Id,
    getH3Position,
    getH3IdentifierCube,
    findClosestAndSecondClosestCell,
    getEdgeFactor,
  };
}
