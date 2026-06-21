import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

// TSL's node builders are intentionally used untyped here (matching the rest of
// the codebase's TSL helpers); the precise generic node types fight heavily with
// the dynamic, chained shader-graph style used below.
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

/**
 * Physically-inspired atmospheric scattering, following Maxime Heckel's
 * "On Rendering the Sky, Sunsets, and Planets". Implemented entirely in TSL as
 * a screen-space post-processing effect:
 *
 *  - Reconstructs world-space rays from the (logarithmic) depth buffer.
 *  - Uses the scene depth to bound the raymarch so geometry occludes the
 *    atmosphere correctly (aerial perspective on the terrain, sky behind it).
 *  - Single-scattering raymarch with Rayleigh + Mie + ozone terms, plus a
 *    nested light-march toward the sun for the in-scattered transmittance.
 *  - Samples a sun-view depth map per raymarch sample so terrain (mountains)
 *    casts volumetric shadows into the atmosphere.
 *
 * The shader works in kilometres internally (positions are divided by 1000) so
 * the classic Earth scale-heights and scattering coefficients can be reused
 * verbatim while the scene itself is authored in metres.
 */

export interface AtmosphereNodeParams {
  /** Planet radius in metres (sea-level datum, planet centred at the origin). */
  planetRadius: number;
  /** Atmosphere shell thickness above the datum, in metres. */
  atmosphereThickness: number;
  /** Scalar multiplier on the incoming sunlight. */
  sunIntensity: number;
  /** Number of primary (view-ray) raymarch steps. */
  primarySteps: number;
  /** Number of secondary (light-ray) raymarch steps. */
  lightSteps: number;
}

export interface AtmosphereUniforms {
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

export interface AtmosphereNode {
  outputNode: any;
  uniforms: AtmosphereUniforms;
}

/**
 * Builds the atmosphere output node and the set of uniforms the host component
 * must refresh each frame.
 *
 * @param colorNode - The beauty pass colour texture node (linear, pre-tonemap).
 * @param depthNode - The beauty pass depth texture node (logarithmic depth).
 * @param sunDepthNode - A depth texture node rendered from the sun's POV.
 * @param params - Static atmosphere configuration.
 */
export function createAtmosphereNode(
  colorNode: any,
  depthNode: any,
  sunDepthNode: any,
  params: AtmosphereNodeParams,
): AtmosphereNode {
  const KM = 1000.0;

  const uniforms: AtmosphereUniforms = {
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

  // --- Static atmosphere model constants (Earth-like, kilometre units) -------
  const planetRadiusKm = float(params.planetRadius / KM);
  const atmosphereRadiusKm = float(
    (params.planetRadius + params.atmosphereThickness) / KM,
  );

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

  // --- Helper functions ------------------------------------------------------

  /** Ray vs origin-centred sphere; returns the near/far hit distances (or -1). */
  const raySphere = Fn(([rayOrigin, rayDir, radius]: [any, any, any]) => {
    const b = dot(rayOrigin, rayDir);
    const c = dot(rayOrigin, rayOrigin).sub(radius.mul(radius));
    const discriminant = b.mul(b).sub(c);
    const result = vec2(-1.0, -1.0).toVar();
    If(discriminant.greaterThanEqual(0.0), () => {
      const s = sqrt(discriminant);
      result.assign(vec2(b.negate().sub(s), b.negate().add(s)));
    });
    return result;
  });

  /** Rayleigh / Mie / ozone density at a sample point (km space). */
  const sampleDensity = Fn(([p]: [any]) => {
    const h = length(p).sub(planetRadiusKm).max(0.0);
    const rayleigh = exp(h.negate().div(rayleighScaleHeight));
    const mie = exp(h.negate().div(mieScaleHeight));
    // Tent-shaped ozone layer centred high in the atmosphere.
    const ozone = max(0.0, float(1.0).sub(h.sub(ozoneCenter).abs().div(ozoneWidth)));
    return vec3(rayleigh, mie, ozone);
  });

  const rayleighPhase = Fn(([mu]: [any]) =>
    float(3.0 / (16.0 * PI)).mul(float(1.0).add(mu.mul(mu))),
  );

  const miePhase = Fn(([mu]: [any]) => {
    const gg = mieG.mul(mieG);
    const numerator = float(3.0).mul(float(1.0).sub(gg)).mul(float(1.0).add(mu.mul(mu)));
    const denominator = float(8.0 * PI)
      .mul(float(2.0).add(gg))
      .mul(pow(max(1e-4, float(1.0).add(gg).sub(mieG.mul(2.0).mul(mu))), 1.5));
    return numerator.div(denominator);
  });

  /**
   * Accumulates optical depth from a sample point toward the sun. Returns a
   * large value when the planet itself blocks the sun (the point is on the
   * night side / in the planet's geometric shadow).
   */
  const lightMarch = Fn(([p]: [any]) => {
    const sunDir = uniforms.uSunDirection;
    const planetHit = raySphere(p, sunDir, planetRadiusKm);
    const atmosphereHit = raySphere(p, sunDir, atmosphereRadiusKm);

    const opticalDepth = vec3(0.0).toVar();
    If(planetHit.x.greaterThan(0.0), () => {
      opticalDepth.assign(vec3(1.0e8));
    }).Else(() => {
      const rayLength = max(atmosphereHit.y, 0.0);
      const stepSize = rayLength.div(float(LIGHT_STEPS));
      const odRayleigh = float(0.0).toVar();
      const odMie = float(0.0).toVar();
      const odOzone = float(0.0).toVar();
      Loop(LIGHT_STEPS, ({ i }: any) => {
        const t = float(i).add(0.5).mul(stepSize);
        const q = p.add(sunDir.mul(t));
        const density = sampleDensity(q);
        odRayleigh.addAssign(density.x.mul(stepSize));
        odMie.addAssign(density.y.mul(stepSize));
        odOzone.addAssign(density.z.mul(stepSize));
      });
      opticalDepth.assign(vec3(odRayleigh, odMie, odOzone));
    });
    return opticalDepth;
  });

  /**
   * Sun visibility in [0, 1] for a world-space point (metres), sampled from the
   * sun-view depth map. 0 = fully occluded by terrain, 1 = fully lit. This is
   * what makes mountains cast shadows into the volume of the atmosphere.
   */
  const sunVisibility = Fn(([worldPositionM]: [any]) => {
    const visibility = float(1.0).toVar();
    If(uniforms.uShadowEnabled.greaterThan(0.5), () => {
      const viewPos = uniforms.uSunViewMatrix.mul(vec4(worldPositionM, 1.0));
      const clip = uniforms.uSunProjectionMatrix.mul(viewPos);
      const ndc = clip.xyz.div(clip.w);
      // Match getScreenPosition()'s WebGPU convention (flip V).
      const shadowUv = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));

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
        // Both view-Z values are negative; the sample sits behind the nearest
        // occluder (further from the sun) when its view-Z is more negative.
        const distanceBehind = occluderViewZ.sub(viewPos.z);
        visibility.assign(
          float(1.0).sub(
            smoothstep(
              uniforms.uShadowBias,
              uniforms.uShadowBias.add(uniforms.uShadowSoftness),
              distanceBehind,
            ),
          ),
        );
      });
    });
    return visibility;
  });

  // --- Main effect -----------------------------------------------------------

  const atmosphere = Fn(() => {
    const uv = screenUV;
    const logDepth = depthNode.sample(uv).r.toVar();
    const sceneColor = colorNode.sample(uv);

    const cameraPositionM = uniforms.uCameraPosition;

    // Reconstruct the world-space position of this pixel from logarithmic depth.
    // The scene uses an enormous far plane, so we go straight from the
    // logarithmic depth to a view-space Z (which preserves precision) and scale
    // the per-pixel view ray to it. Round-tripping through a perspective depth
    // would collapse every foreground sample onto the far plane.
    const viewZ = logarithmicDepthToViewZ(
      logDepth,
      uniforms.uCameraNear,
      uniforms.uCameraFar,
    );

    // Per-pixel view-space ray direction (camera origin is (0,0,0) in view space).
    const ndc = vec2(uv.x, uv.y.oneMinus()).mul(2.0).sub(1.0);
    const clipNear = vec4(ndc.x, ndc.y, 0.0, 1.0);
    const viewNear = uniforms.uCameraProjectionInverse.mul(clipNear);
    const viewRay = normalize(viewNear.xyz.div(viewNear.w));
    const viewPosition = viewRay.mul(viewZ.div(viewRay.z));
    const worldPositionM = uniforms.uCameraWorldMatrix.mul(vec4(viewPosition, 1.0)).xyz;

    const isForeground = logDepth.lessThan(0.9999);

    const rayDirection = normalize(worldPositionM.sub(cameraPositionM));
    const sceneDistanceKm = length(worldPositionM.sub(cameraPositionM)).div(KM);
    const rayOriginKm = cameraPositionM.div(KM);

    const atmosphereHit = raySphere(rayOriginKm, rayDirection, atmosphereRadiusKm);
    const planetHit = raySphere(rayOriginKm, rayDirection, planetRadiusKm);

    const color = sceneColor.rgb.toVar();

    If(atmosphereHit.y.greaterThan(0.0), () => {
      const nearDistance = max(atmosphereHit.x, 0.0).toVar();
      const farDistance = atmosphereHit.y.toVar();

      // Stop at the planet's surface if the ray would hit it.
      If(planetHit.x.greaterThan(0.0), () => {
        farDistance.assign(min(farDistance, planetHit.x));
      });
      // Stop at the nearest scene geometry (terrain / other meshes).
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

          // Combined transmittance: camera -> sample (view) + sample -> sun.
          const tau = betaRayleigh
            .mul(odRayleigh.add(sunOpticalDepth.x))
            .add(betaMieExtinction.mul(odMie.add(sunOpticalDepth.y)))
            .add(betaOzoneAbsorption.mul(odOzone.add(sunOpticalDepth.z)));
          const transmittance = exp(tau.negate());

          // Terrain shadowing of the in-scattered sunlight at this sample.
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

        // View transmittance over the whole segment, used to attenuate the
        // scene colour behind the atmosphere (aerial perspective).
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
