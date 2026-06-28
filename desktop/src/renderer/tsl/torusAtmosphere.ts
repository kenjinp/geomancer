import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

// As with the spherical atmosphere helper, these nodes are intentionally kept
// loose-typed so the dynamic TSL graph style stays readable.
const {
  clamp,
  dot,
  exp,
  float,
  Fn,
  If,
  length,
  logarithmicDepthToViewZ,
  Loop,
  max,
  min,
  normalize,
  orthographicDepthToViewZ,
  pow,
  screenUV,
  smoothstep,
  sqrt,
  uniform,
  vec2,
  vec3,
  vec4,
} = TSL as any;

const PI = Math.PI;

export interface TorusAtmosphereNodeParams {
  /** Distance from torus center to tube center, in metres. */
  majorRadius: number;
  /** Base tube radius, in metres. */
  minorRadius: number;
  /** Torus center in world space. */
  center?: { x: number; y: number; z: number };
  /** Atmosphere shell thickness above the torus surface, in metres. */
  atmosphereThickness: number;
  /** Scalar multiplier on the incoming sunlight. */
  sunIntensity: number;
  /** Number of primary (view-ray) raymarch steps. */
  primarySteps: number;
  /** Number of secondary (light-ray) raymarch steps. */
  lightSteps: number;
}

export interface TorusAtmosphereUniforms {
  uCameraPosition: any;
  uCameraWorldMatrix: any;
  uCameraProjectionInverse: any;
  uCameraNear: any;
  uCameraFar: any;
  uSunDirection: any;
  uSunIntensity: any;
  uSunViewMatrix: any;
  uSunProjectionMatrix: any;
  uSunNear: any;
  uSunFar: any;
  uShadowBias: any;
  uShadowSoftness: any;
  uShadowEnabled: any;
}

export interface TorusAtmosphereNode {
  outputNode: any;
  uniforms: TorusAtmosphereUniforms;
}

/**
 * Screen-space volumetric atmosphere for a torus world.
 *
 * The volume is a shell around the torus distance field: `height = distance to
 * tube center - minorRadius`. Samples with `0 <= height <= thickness` receive
 * Earth-like Rayleigh/Mie/ozone densities; samples below the base tube are solid
 * ground and block the nested sun march.
 */
export function createTorusAtmosphereNode(
  colorNode: any,
  depthNode: any,
  sunDepthNode: any,
  params: TorusAtmosphereNodeParams,
): TorusAtmosphereNode {
  const KM = 1000.0;
  const center = params.center ?? { x: 0, y: 0, z: 0 };

  const uniforms: TorusAtmosphereUniforms = {
    uCameraPosition: uniform(new THREE.Vector3()),
    uCameraWorldMatrix: uniform(new THREE.Matrix4()),
    uCameraProjectionInverse: uniform(new THREE.Matrix4()),
    uCameraNear: uniform(0.1),
    uCameraFar: uniform(1.0),
    uSunDirection: uniform(new THREE.Vector3(0, 1, 0)),
    uSunIntensity: uniform(params.sunIntensity),
    uSunViewMatrix: uniform(new THREE.Matrix4()),
    uSunProjectionMatrix: uniform(new THREE.Matrix4()),
    uSunNear: uniform(1.0),
    uSunFar: uniform(1.0),
    uShadowBias: uniform(200.0),
    uShadowSoftness: uniform(400.0),
    uShadowEnabled: uniform(1.0),
  };

  const majorRadiusKm = float(params.majorRadius / KM);
  const minorRadiusKm = float(params.minorRadius / KM);
  const atmosphereThicknessKm = float(params.atmosphereThickness / KM);
  const atmosphereBoundRadiusKm = float(
    (params.majorRadius + params.minorRadius + params.atmosphereThickness) /
      KM,
  );
  const centerKm = vec3(center.x / KM, center.y / KM, center.z / KM);

  const rayleighScaleHeight = float(8.0); // km
  const mieScaleHeight = float(1.2); // km
  const ozoneCenter = float(25.0); // km
  const ozoneWidth = float(15.0); // km

  const betaRayleigh = vec3(0.0058, 0.0135, 0.0331); // per km
  const betaMieScatter = vec3(0.003, 0.003, 0.003); // per km
  const betaMieExtinction = betaMieScatter.mul(1.1);
  const betaOzoneAbsorption = vec3(0.00065, 0.00188, 0.00008); // per km
  const mieG = float(0.76);

  const PRIMARY_STEPS = params.primarySteps;
  const LIGHT_STEPS = params.lightSteps;

  /** Ray vs centred bounding sphere; returns near/far hit distances or -1. */
  const raySphere = Fn(
    ([rayOrigin, rayDir, sphereCenter, radius]: [any, any, any, any]) => {
      const oc = rayOrigin.sub(sphereCenter);
      const b = dot(oc, rayDir);
      const c = dot(oc, oc).sub(radius.mul(radius));
      const discriminant = b.mul(b).sub(c);
      const result = vec2(-1.0, -1.0).toVar();
      If(discriminant.greaterThanEqual(0.0), () => {
        const s = sqrt(discriminant);
        result.assign(vec2(b.negate().sub(s), b.negate().add(s)));
      });
      return result;
    },
  );

  /** Signed height above the base torus tube, in kilometres. */
  const torusAltitude = Fn(([p]: [any]) => {
    const q = p.sub(centerKm);
    const rho = sqrt(q.x.mul(q.x).add(q.z.mul(q.z)));
    const ringDistance = rho.sub(majorRadiusKm);
    const tubeDistance = sqrt(ringDistance.mul(ringDistance).add(q.y.mul(q.y)));
    return tubeDistance.sub(minorRadiusKm);
  });

  /** Rayleigh / Mie / ozone density at a torus-shell sample point. */
  const sampleDensity = Fn(([p]: [any]) => {
    const h = torusAltitude(p);
    const density = vec3(0.0).toVar();
    If(h.greaterThanEqual(0.0).and(h.lessThanEqual(atmosphereThicknessKm)), () => {
      const rayleigh = exp(h.negate().div(rayleighScaleHeight));
      const mie = exp(h.negate().div(mieScaleHeight));
      const ozone = max(
        0.0,
        float(1.0).sub(h.sub(ozoneCenter).abs().div(ozoneWidth)),
      );
      density.assign(vec3(rayleigh, mie, ozone));
    });
    return density;
  });

  const rayleighPhase = Fn(([mu]: [any]) =>
    float(3.0 / (16.0 * PI)).mul(float(1.0).add(mu.mul(mu))),
  );

  const miePhase = Fn(([mu]: [any]) => {
    const gg = mieG.mul(mieG);
    const numerator = float(3.0)
      .mul(float(1.0).sub(gg))
      .mul(float(1.0).add(mu.mul(mu)));
    const denominator = float(8.0 * PI)
      .mul(float(2.0).add(gg))
      .mul(
        pow(
          max(1e-4, float(1.0).add(gg).sub(mieG.mul(2.0).mul(mu))),
          1.5,
        ),
      );
    return numerator.div(denominator);
  });

  /**
   * Accumulates optical depth from a sample toward the sun. A fixed raymarch is
   * used here instead of an analytic torus intersection so the solid body and
   * atmospheric shell share the exact same distance field.
   */
  const lightMarch = Fn(([p]: [any]) => {
    const sunDir = uniforms.uSunDirection;
    const atmosphereHit = raySphere(
      p,
      sunDir,
      centerKm,
      atmosphereBoundRadiusKm,
    );

    const opticalDepth = vec3(0.0).toVar();
    If(atmosphereHit.y.greaterThan(0.0), () => {
      const rayLength = max(atmosphereHit.y, 0.0);
      const stepSize = rayLength.div(float(LIGHT_STEPS));
      const odRayleigh = float(0.0).toVar();
      const odMie = float(0.0).toVar();
      const odOzone = float(0.0).toVar();
      const blocked = float(0.0).toVar();

      Loop(LIGHT_STEPS, ({ i }: any) => {
        const t = float(i).add(0.5).mul(stepSize);
        const q = p.add(sunDir.mul(t));
        If(torusAltitude(q).lessThan(0.0), () => {
          blocked.assign(1.0);
        });
        const density = sampleDensity(q).mul(float(1.0).sub(blocked));
        odRayleigh.addAssign(density.x.mul(stepSize));
        odMie.addAssign(density.y.mul(stepSize));
        odOzone.addAssign(density.z.mul(stepSize));
      });

      If(blocked.greaterThan(0.5), () => {
        opticalDepth.assign(vec3(1.0e8));
      }).Else(() => {
        opticalDepth.assign(vec3(odRayleigh, odMie, odOzone));
      });
    });
    return opticalDepth;
  });

  const sunVisibility = Fn(([worldPositionM]: [any]) => {
    const visibility = float(1.0).toVar();
    If(uniforms.uShadowEnabled.greaterThan(0.01), () => {
      const viewPos = uniforms.uSunViewMatrix.mul(vec4(worldPositionM, 1.0));
      const clip = uniforms.uSunProjectionMatrix.mul(viewPos);
      const ndc = clip.xyz.div(clip.w);
      const shadowUv = vec2(
        ndc.x.mul(0.5).add(0.5),
        float(0.5).sub(ndc.y.mul(0.5)),
      );

      const inside = shadowUv.x
        .greaterThanEqual(0.0)
        .and(shadowUv.x.lessThanEqual(1.0))
        .and(shadowUv.y.greaterThanEqual(0.0))
        .and(shadowUv.y.lessThanEqual(1.0))
        .and(viewPos.z.lessThan(0.0));

      If(inside, () => {
        const storedDepth = sunDepthNode.sample(shadowUv).r;
        const occluderViewZ = orthographicDepthToViewZ(
          storedDepth,
          uniforms.uSunNear,
          uniforms.uSunFar,
        );
        const distanceBehind = occluderViewZ.sub(viewPos.z);
        const shadowed = smoothstep(
          uniforms.uShadowBias,
          uniforms.uShadowBias.add(uniforms.uShadowSoftness),
          distanceBehind,
        );
        visibility.assign(
          float(1.0).sub(shadowed.mul(uniforms.uShadowEnabled)),
        );
      });
    });
    return visibility;
  });

  const atmosphere = Fn(() => {
    const uv = screenUV;
    const logDepth = depthNode.sample(uv).r.toVar();
    const sceneColor = colorNode.sample(uv);

    const cameraPositionM = uniforms.uCameraPosition;
    const viewZ = logarithmicDepthToViewZ(
      logDepth,
      uniforms.uCameraNear,
      uniforms.uCameraFar,
    );
    const ndc = vec2(uv.x, uv.y.oneMinus()).mul(2.0).sub(1.0);
    const clipNear = vec4(ndc.x, ndc.y, 0.0, 1.0);
    const viewNear = uniforms.uCameraProjectionInverse.mul(clipNear);
    const viewRay = normalize(viewNear.xyz.div(viewNear.w));
    const viewPosition = viewRay.mul(viewZ.div(viewRay.z));
    const worldPositionM = uniforms.uCameraWorldMatrix.mul(
      vec4(viewPosition, 1.0),
    ).xyz;

    const isForeground = logDepth.lessThan(0.9999);
    const rayDirection = normalize(worldPositionM.sub(cameraPositionM));
    const sceneDistanceKm = length(worldPositionM.sub(cameraPositionM)).div(KM);
    const rayOriginKm = cameraPositionM.div(KM);
    const atmosphereHit = raySphere(
      rayOriginKm,
      rayDirection,
      centerKm,
      atmosphereBoundRadiusKm,
    );

    const color = sceneColor.rgb.toVar();

    If(atmosphereHit.y.greaterThan(0.0), () => {
      const nearDistance = max(atmosphereHit.x, 0.0).toVar();
      const farDistance = atmosphereHit.y.toVar();

      If(isForeground, () => {
        farDistance.assign(min(farDistance, sceneDistanceKm));
      });

      If(farDistance.greaterThan(nearDistance), () => {
        const segment = farDistance.sub(nearDistance);
        const stepSize = segment.div(float(PRIMARY_STEPS));

        const odRayleigh = float(0.0).toVar();
        const odMie = float(0.0).toVar();
        const odOzone = float(0.0).toVar();
        const scatterRayleigh = vec3(0.0).toVar();
        const scatterMie = vec3(0.0).toVar();

        Loop(PRIMARY_STEPS, ({ i }: any) => {
          const t = nearDistance.add(float(i).add(0.5).mul(stepSize));
          const samplePointKm = rayOriginKm.add(rayDirection.mul(t));
          const density = sampleDensity(samplePointKm);

          odRayleigh.addAssign(density.x.mul(stepSize));
          odMie.addAssign(density.y.mul(stepSize));
          odOzone.addAssign(density.z.mul(stepSize));

          const sunOpticalDepth = lightMarch(samplePointKm);
          const tau = betaRayleigh
            .mul(odRayleigh.add(sunOpticalDepth.x))
            .add(betaMieExtinction.mul(odMie.add(sunOpticalDepth.y)))
            .add(betaOzoneAbsorption.mul(odOzone.add(sunOpticalDepth.z)));
          const transmittance = exp(tau.negate());

          const shadow = sunVisibility(samplePointKm.mul(KM));
          const lit = transmittance.mul(shadow);

          scatterRayleigh.addAssign(density.x.mul(lit).mul(stepSize));
          scatterMie.addAssign(density.y.mul(lit).mul(stepSize));
        });

        const mu = dot(rayDirection, uniforms.uSunDirection);
        const phaseR = rayleighPhase(mu);
        const phaseM = miePhase(mu);

        const inScatter = uniforms.uSunIntensity.mul(
          phaseR
            .mul(betaRayleigh)
            .mul(scatterRayleigh)
            .add(phaseM.mul(betaMieScatter).mul(scatterMie)),
        );

        const viewTau = betaRayleigh
          .mul(odRayleigh)
          .add(betaMieExtinction.mul(odMie))
          .add(betaOzoneAbsorption.mul(odOzone));
        const viewTransmittance = exp(viewTau.negate());

        color.assign(color.mul(viewTransmittance).add(inScatter));
      });
    });

    return vec4(clamp(color, 0.0, 1.0e4), 1.0);
  });

  return { outputNode: atmosphere(), uniforms };
}
