import {
  Fn,
  float,
  instanceIndex,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  normalize,
  positionLocal,
  select,
  transformNormalToView,
  uint,
  varying,
  vec3,
  vec4,
} from "three/tsl";

import { createGetMapLayer } from "./layers";
import type { TerrainUniformNodes } from "./uniforms";

export function createTerrainVertexNodes(uniforms: TerrainUniformNodes) {
  const vWorldPosition = varying(vec4());
  const vSphereNormal = varying(vec3());
  const vInstanceId = varying(float());

  const getMapLayer = createGetMapLayer(uniforms);

  const positionNode = Fn(() => {
    const worldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const sphereDir = normalize(worldPos.sub(uniforms.uOffset));
    const spherePos = uniforms.uOffset.add(sphereDir.mul(uniforms.uRadius));

    vWorldPosition.assign(vec4(spherePos, 1.0));
    vInstanceId.assign(float(instanceIndex));

    const sphereLocal = modelWorldMatrixInverse.mul(vec4(spherePos, 1.0)).xyz;
    const useSphere = getMapLayer(uint(4));

    return select(useSphere, sphereLocal, positionLocal);
  });

  const normalNode = Fn(() => {
    const worldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const sphereDir = normalize(worldPos.sub(uniforms.uOffset));
    vSphereNormal.assign(transformNormalToView(sphereDir));
    return vSphereNormal;
  });

  return { positionNode, normalNode, vWorldPosition, vSphereNormal, vInstanceId };
}
