import {
  MeshStandardNodeMaterial,
  color,
  cross,
  dot,
  float,
  modelNormalMatrix,
  positionLocal,
  sign,
  smoothstep,
  step,
  tslFn,
  uniform,
  varyingProperty,
  vec2,
  vec3,
  loop,
} from "three/tsl";
import { simplexNoise2d } from "./simplexNoise2d";

/**
 * Terrain
 */
export class TileMaterial {
  material: MeshStandardNodeMaterial;
  noiseIterations = uniform(3);
  positionFrequency = uniform(0.125);
  warpFrequency = uniform(5.5);
  warpStrength = uniform(0.75);
  strength = uniform(4);
  offset = uniform(vec2(0, 0));
  neighboursShift = uniform(0.01);

  colorWaterDeep = uniform(color("#002b3d"));
  colorWaterSurface = uniform(color("#66a8ff"));
  colorSand = uniform(color("#ffe894"));
  colorGrass = uniform(color("#85d534"));
  colorSnow = uniform(color("#ffffff"));
  colorRock = uniform(color("#bfbd8d"));

  vNormal = varyingProperty("vec3");
  vPosition = varyingProperty("vec3");

  constructor() {
    this.material = new MeshStandardNodeMaterial({
      metalness: 0,
      roughness: 0.5,
      color: "#85d534",
    });

    this.initMaterial();
  }

  private getElevation = tslFn(([position]) => {
    const warpedPosition = position.add(this.offset);
    warpedPosition.addAssign(
      simplexNoise2d(
        warpedPosition.mul(this.positionFrequency).mul(this.warpFrequency)
      ).mul(this.warpStrength)
    );

    const elevation = float(0).toVar();
    loop(
      { type: "float", start: 1, end: this.noiseIterations, condition: "<=" },
      ({ i }) => {
        const noiseInput = warpedPosition
          .mul(this.positionFrequency)
          .mul(i.mul(2))
          .add(i.mul(987));
        const noise = simplexNoise2d(noiseInput).div(i.add(1).mul(2));
        elevation.addAssign(noise);
      }
    );

    const elevationSign = sign(elevation);
    elevation.assign(
      elevation.abs().pow(2).mul(elevationSign).mul(this.strength)
    );

    return elevation;
  });

  private initMaterial() {
    // Position
    this.material.positionNode = tslFn(() => {
      // Neighbours positions
      const neighbourA = positionLocal.xyz.add(
        vec3(this.neighboursShift, 0.0, 0.0)
      );
      const neighbourB = positionLocal.xyz.add(
        vec3(0.0, 0.0, this.neighboursShift.negate())
      );

      // Elevations
      const position = positionLocal.xyz.toVar();
      const elevation = this.getElevation(positionLocal.xz);
      position.y.addAssign(elevation);

      neighbourA.y.addAssign(this.getElevation(neighbourA.xz));
      neighbourB.y.addAssign(this.getElevation(neighbourB.xz));

      // Compute normal
      const toA = neighbourA.sub(position).normalize();
      const toB = neighbourB.sub(position).normalize();
      this.vNormal.assign(cross(toA, toB));

      // Varyings
      this.vPosition.assign(
        position.add(vec3(this.offset.x, 0, this.offset.y))
      );

      return position;
    })();

    // Normal
    this.material.normalNode = modelNormalMatrix.mul(this.vNormal);

    // Color
    this.material.colorNode = tslFn(() => {
      const finalColor = this.colorWaterDeep.toVar();

      // Water
      const surfaceWaterMix = smoothstep(-1.0, -0.1, this.vPosition.y);
      finalColor.assign(
        surfaceWaterMix.mix(finalColor, this.colorWaterSurface)
      );

      // Sand
      const sandMix = step(-0.1, this.vPosition.y);
      finalColor.assign(sandMix.mix(finalColor, this.colorSand));

      // Grass
      const grassMix = step(-0.06, this.vPosition.y);
      finalColor.assign(grassMix.mix(finalColor, this.colorGrass));

      // Rock
      const rockMix = step(0.5, dot(this.vNormal, vec3(0, 1, 0))).oneMinus();
      rockMix.mulAssign(step(-0.06, this.vPosition.y));
      finalColor.assign(rockMix.mix(finalColor, this.colorRock));

      // Snow
      const snowThreshold = simplexNoise2d(this.vPosition.xz.mul(15))
        .mul(0.1)
        .add(0.45);
      const snowMix = step(snowThreshold, this.vPosition.y);
      finalColor.assign(snowMix.mix(finalColor, this.colorSnow));

      return finalColor;
    })();
  }
}
