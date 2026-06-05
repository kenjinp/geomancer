import { Color, MeshStandardNodeMaterial } from "three/webgpu";

import { createTerrainColorNode } from "./color";
import { createTerrainUniforms, type TerrainUniformValues } from "./uniforms";
import { createTerrainVertexNodes } from "./vertex";

export function createTerrainMaterial(values: TerrainUniformValues) {
  const uniforms = createTerrainUniforms(values);
  const { positionNode, normalNode, vWorldPosition } = createTerrainVertexNodes(uniforms);
  const colorNode = createTerrainColorNode(uniforms, vWorldPosition);

  const material = new MeshStandardNodeMaterial({
    roughness: 0.5,
    metalness: 0.0,
    color: new Color(1, 1, 1),
  });

  material.positionNode = positionNode();
  material.normalNode = normalNode();
  material.colorNode = colorNode();
  material.lights = values.uMapLayers & (1 << 2) ? true : false;

  return { material, uniforms };
}
