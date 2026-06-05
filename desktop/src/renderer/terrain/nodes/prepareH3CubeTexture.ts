import {
  CubeTexture,
  DataTexture,
  FloatType,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
} from "three";

const PREPARED = Symbol("geomancerWebgpuH3Cube");

/** WebGPU samples unfilterable textures via textureLoad + 2D coords, which breaks vec3 cube lookups. */
export function prepareH3CubeTextureForWebGPU(cube: CubeTexture): CubeTexture {
  if ((cube as CubeTexture & { [PREPARED]?: boolean })[PREPARED]) {
    return cube;
  }

  const faces = cube.image as DataTexture[];
  const firstFace = faces[0];
  if (firstFace?.type === FloatType) {
    cube.minFilter = LinearFilter;
    cube.magFilter = LinearFilter;
    for (const face of faces) {
      face.minFilter = LinearFilter;
      face.magFilter = LinearFilter;
      face.needsUpdate = true;
    }
    cube.needsUpdate = true;
    (cube as CubeTexture & { [PREPARED]?: boolean })[PREPARED] = true;
    return cube;
  }

  const floatFaces = faces.map((face) => {
    const data = face.image.data;
    const floatData = new Float32Array(data.length);
    if (face.type === UnsignedByteType) {
      const bytes = data as Uint8Array;
      for (let i = 0; i < bytes.length; i++) {
        floatData[i] = bytes[i] / 255;
      }
    } else {
      const floats = data as Float32Array;
      floatData.set(floats);
    }

    const tex = new DataTexture(floatData, face.image.width, face.image.height, RGBAFormat, FloatType);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.flipY = face.flipY;
    tex.needsUpdate = true;
    return tex;
  });

  const floatCube = new CubeTexture(floatFaces);
  floatCube.minFilter = LinearFilter;
  floatCube.magFilter = LinearFilter;
  floatCube.generateMipmaps = cube.generateMipmaps;
  floatCube.needsUpdate = true;
  (floatCube as CubeTexture & { [PREPARED]?: boolean })[PREPARED] = true;
  return floatCube;
}
