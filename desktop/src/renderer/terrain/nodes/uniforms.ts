import type { CubeTexture, Matrix4, Texture, Vector3 } from "three";
import { Texture as TextureImpl } from "three";
import { cubeTexture, texture, uniform, uint } from "three/tsl";

import { prepareH3CubeTextureForWebGPU } from "./prepareH3CubeTexture";

function requireTexture<T extends Texture>(tex: T | undefined, name: string): T {
  if (!tex || !(tex instanceof TextureImpl)) {
    throw new Error(`Terrain shaders require a valid ${name} before the material is built.`);
  }
  return tex;
}

export interface TerrainUniformNodes {
  uMapMode: ReturnType<typeof uniform>;
  uMapLayers: ReturnType<typeof uniform>;
  uSelectedTile: ReturnType<typeof uniform>;
  uRadius: ReturnType<typeof uniform>;
  uOffset: ReturnType<typeof uniform>;
  h3IndexMap: ReturnType<typeof cubeTexture>;
  h3NeighborMap: ReturnType<typeof texture>;
  h3PositionMap: ReturnType<typeof texture>;
  hexTileIntBuffer: ReturnType<typeof texture>;
  hexTileFloatBuffer: ReturnType<typeof texture>;
  uHexJitterAmount: ReturnType<typeof uniform>;
  uApplyHexJitter: ReturnType<typeof uniform>;
}

export interface TerrainUniformValues {
  uMapMode: number;
  uMapLayers: number;
  uSelectedTile: number;
  uRadius: number;
  uOffset: Vector3;
  h3IndexMap: CubeTexture;
  h3NeighborMap: Texture;
  h3PositionMap: Texture;
  uModelMatrix: Matrix4;
  hexTileIntBuffer: Texture;
  hexTileFloatBuffer: Texture;
  uHexJitterAmount: number;
  uApplyHexJitter: number;
}

export function createTerrainUniforms(values: TerrainUniformValues): TerrainUniformNodes {
  return {
    uMapMode: uniform(values.uMapMode),
    uMapLayers: uniform(uint(values.uMapLayers)),
    uSelectedTile: uniform(values.uSelectedTile),
    uRadius: uniform(values.uRadius),
    uOffset: uniform(values.uOffset),
    h3IndexMap: cubeTexture(
      prepareH3CubeTextureForWebGPU(requireTexture(values.h3IndexMap, "h3IndexMap (CubeTexture)")),
    ),
    h3NeighborMap: texture(requireTexture(values.h3NeighborMap, "h3NeighborMap")),
    h3PositionMap: texture(requireTexture(values.h3PositionMap, "h3PositionMap")),
    hexTileIntBuffer: texture(requireTexture(values.hexTileIntBuffer, "hexTileIntBuffer")),
    hexTileFloatBuffer: texture(requireTexture(values.hexTileFloatBuffer, "hexTileFloatBuffer")),
    uHexJitterAmount: uniform(values.uHexJitterAmount),
    uApplyHexJitter: uniform(uint(values.uApplyHexJitter ? 1 : 0)),
  };
}
