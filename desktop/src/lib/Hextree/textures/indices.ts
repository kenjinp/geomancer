import * as h3 from "h3-js";
import {
  DataArrayTexture,
  FloatType,
  NearestFilter,
  RedFormat,
  Vector3,
} from "three";
import { generateFaceData } from "./Faces";

const RESOLUTION = 1;
const FACE_SIZE = 512; // Texture size per face

export async function createH3LookupTexture() {
  const faces = generateFaceData();
  const textureData = new Uint32Array(FACE_SIZE * FACE_SIZE * 20);

  for (let face = 0; face < 20; face++) {
    const { transform } = faces[face];

    console.log(`face ${face} started`);
    for (let y = 0; y < FACE_SIZE; y++) {
      for (let x = 0; x < FACE_SIZE; x++) {
        // Convert texture UV to 3D direction
        const u = (x / FACE_SIZE) * 2 - 1;
        const v = (y / FACE_SIZE) * 2 - 1;
        const localDir = new Vector3(u, v, 1).normalize();
        const worldDir = localDir.applyMatrix3(transform).normalize();

        // Convert to geographic coordinates
        const lat = 90 - (Math.acos(worldDir.y) * 180) / Math.PI;
        const lng = (Math.atan2(worldDir.z, worldDir.x) * 180) / Math.PI;

        // Get H3 index
        const h3Index = h3.latLngToCell(lat, lng, RESOLUTION);
        const bufferPos = face * FACE_SIZE * FACE_SIZE + y * FACE_SIZE + x;
        textureData[bufferPos] = h3.cellToLatLng(h3Index)[0]; // Lower 32 bits
      }
    }
  }

  const texture = new DataArrayTexture(textureData, FACE_SIZE, FACE_SIZE, 20);
  texture.type = FloatType;
  texture.format = RedFormat;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;

  return texture;
}
