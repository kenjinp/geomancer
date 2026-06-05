import { Fn, float, floor, ivec2, int, mod, textureLoad, textureSize, vec2, vec4 } from "three/tsl";

import { toFloat } from "./math";
import type { TerrainUniformNodes } from "./uniforms";

export function createTileDataNodes(uniforms: TerrainUniformNodes) {
  // textureLoad() must receive THREE.Texture, not an existing TextureNode.
  const intTexture = uniforms.hexTileIntBuffer.value;

  const getHexTileIntData = Fn(([tileIndex]: [ReturnType<typeof float>]) => {
    const index = toFloat(tileIndex).toVar();
    const texSize = textureSize(uniforms.hexTileIntBuffer, 0);
    const texW = float(texSize.x);
    const row = int(floor(index.div(texW)));
    const col = int(mod(index, texW));
    const raw = textureLoad(intTexture, ivec2(col, row));
    return vec4(float(raw.r), float(raw.g), float(raw.b), float(raw.a));
  }, "vec4");

  const getHexTileFloatData = Fn(([tileIndex]: [ReturnType<typeof float>]) => {
    const index = toFloat(tileIndex).toVar();
    const texSize = textureSize(uniforms.hexTileFloatBuffer, 0);
    const texW = float(texSize.x);
    const texH = float(texSize.y);
    const row = floor(index.div(texW));
    const col = mod(index, texW);
    const uv = vec2(col.add(0.5).div(texW), row.add(0.5).div(texH));
    return uniforms.hexTileFloatBuffer.sample(uv);
  }, "vec4");

  return { getHexTileIntData, getHexTileFloatData };
}
