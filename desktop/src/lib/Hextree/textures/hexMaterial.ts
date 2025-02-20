// setup-material.ts
import { Color, GLSL3, ShaderMaterial, Uniform, Vector3 } from "three";
import { generateFaceData } from "./faces";
import fragmentShader from "./h3.frag";
import vertexShader from "./h3.vert";
import { createH3LookupTexture } from "./indices";

export async function createH3Material() {
  const faceData = generateFaceData();
  const h3LookupTex = await createH3LookupTexture();
  return new ShaderMaterial({
    uniforms: {
      h3LookupTex: new Uniform(h3LookupTex),
      faceNormals: { value: faceData.map((f) => f.normal) },
      faceTransforms: { value: faceData.map((f) => f.transform) },
      uRadius: { value: 1 },
      uOffset: { value: new Vector3(0, 0, 0) },
      uColor: { value: new Color(0.0, 1.0, 0.0) },
    },
    vertexColors: true,
    vertexShader,
    fragmentShader,
    glslVersion: GLSL3,
  });
}
