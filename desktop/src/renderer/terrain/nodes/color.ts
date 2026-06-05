import {
  Fn,
  If,
  abs,
  exp,
  float,
  instanceIndex,
  int,
  mix,
  normalize,
  smoothstep,
  uint,
  vec2,
  vec3,
} from "three/tsl";

import { getColorForElevation } from "./colors";
import { getGrid, getGridFromFloat } from "./grid";
import { createH3Nodes } from "./h3";
import { getLatLong } from "./latlong";
import { createGetMapLayer } from "./layers";
import { greatCircleDistance, hashFloat, terrainRemap, toFloat } from "./math";
import { createTileDataNodes } from "./tiledata";
import type { TerrainUniformNodes } from "./uniforms";

export function createTerrainColorNode(
  uniforms: TerrainUniformNodes,
  vWorldPosition: ReturnType<typeof import("three/tsl").varying>,
) {
  const getMapLayer = createGetMapLayer(uniforms);
  const h3 = createH3Nodes(uniforms);
  const tileData = createTileDataNodes(uniforms);

  return Fn(() => {
    const hexJitterAmount = uniforms.uHexJitterAmount.greaterThan(float(0)).select(
      uniforms.uHexJitterAmount,
      float(0.02),
    );
    const worldPos = vWorldPosition.xyz.div(vWorldPosition.w);
    const sphereDirection = normalize(worldPos.sub(uniforms.uOffset));
    const spherePos = uniforms.uOffset.add(sphereDirection.mul(uniforms.uRadius));

    const currentId = h3.getH3IdentifierCube(sphereDirection);
    const closestPair = h3.findClosestAndSecondClosestCell(spherePos, toFloat(currentId), hexJitterAmount);
    const closestId = toFloat(closestPair.x);
    const secondClosestId = toFloat(closestPair.y);

    const latlong = getLatLong(worldPos);
    const latlongUV = vec2(
      terrainRemap(latlong.x, float(-90), float(90), float(0), float(1)).negate(),
      terrainRemap(latlong.y, float(-180), float(180), float(0), float(1)),
    );
    const latlongUVWithReps = vec2(latlongUV.x.mul(18.0), latlongUV.y.mul(36.0));

    const cellColor = hashFloat(closestId);
    const intData = tileData.getHexTileIntData(closestId);
    const floatData = tileData.getHexTileFloatData(closestId);
    const secondFloatData = tileData.getHexTileFloatData(secondClosestId);

    const elevation = floatData.a.toVar();

    If(getMapLayer(uint(5)), () => {
      const normalizedPos = normalize(spherePos);
      const closestCenter = normalize(h3.getH3Position(closestId, hexJitterAmount));
      const closestDist = greatCircleDistance(normalizedPos, closestCenter);
      const secondClosestCenter = normalize(h3.getH3Position(secondClosestId, hexJitterAmount));
      const secondClosestDist = greatCircleDistance(normalizedPos, secondClosestCenter);
      const edgeFactor =
        closestDist.greaterThan(0).and(secondClosestDist.greaterThan(0)).select(
          smoothstep(
            float(0),
            float(1),
            float(1).sub(abs(closestDist.sub(secondClosestDist)).div(closestDist.add(secondClosestDist))),
          ),
          float(0),
        );
      const basicElevation = mix(floatData.a, secondFloatData.a, float(0.5));
      const gaussianBlend = mix(float(0.5), float(0.9), smoothstep(float(0.2), float(0.8), edgeFactor));
      elevation.assign(mix(basicElevation, secondFloatData.a, gaussianBlend));
    });

    const baseColor = vec3(0.5, 0.5, 0.5).toVar();

    If(uniforms.uMapMode.equal(uint(1)), () => {
      baseColor.assign(
        getColorForElevation(terrainRemap(elevation, float(-1), float(1), float(-8000), float(8000))).xyz,
      );
    });
    If(uniforms.uMapMode.equal(uint(2)), () => {
      baseColor.assign(hashFloat(intData.x));
    });
    If(uniforms.uMapMode.equal(uint(3)), () => {
      baseColor.assign(cellColor);
    });
    If(uniforms.uMapMode.equal(uint(4)), () => {
      baseColor.assign(hashFloat(float(instanceIndex)));
    });

    If(getMapLayer(uint(3)), () => {
      baseColor.assign(mix(baseColor, hashFloat(float(instanceIndex)), float(0.5)));
    });

    If(getMapLayer(uint(6)), () => {
      const coastalNess = exp(abs(elevation).mul(float(-200)));
      baseColor.assign(mix(baseColor, vec3(0, 1, 1), coastalNess));
    });

    const showGrid = getMapLayer(uint(1)).select(float(1), float(0));
    const lineWidth = float(1.0);
    const grid = getGrid(latlongUVWithReps, float(1), lineWidth).mul(float(0.5));
    const whiteGridColors = mix(baseColor, vec3(1), grid.mul(showGrid));

    const primeMeridian = getGridFromFloat(latlongUV.y, float(0.5), lineWidth.mul(1.2));
    const equator = getGridFromFloat(latlongUV.x, float(0.5), lineWidth.mul(1.2));
    const combinedGrid2 = primeMeridian.add(equator);

    const combinedGridColors = mix(whiteGridColors, vec3(1, 0, 0), combinedGrid2.mul(showGrid).mul(float(0.5))).toVar();

    If(
      uniforms.uSelectedTile.greaterThan(int(-1)).and(uniforms.uSelectedTile.equal(int(closestPair.x))),
      () => {
        combinedGridColors.assign(vec3(1, 0, 0));
      },
    );

    const edge = getMapLayer(uint(0)).select(
      h3.getEdgeFactor(spherePos, closestId, hexJitterAmount, float(0.0006)),
      float(0),
    );

    return mix(combinedGridColors, vec3(0), edge);
  });
}
