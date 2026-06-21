import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { pass, texture } from "three/tsl";
import * as THREE from "three/webgpu";

import {
  createAtmosphereNode,
  type AtmosphereUniforms,
} from "../../tsl/atmosphere";

export interface AtmosphereProps {
  /** Planet radius in metres (planet is assumed centred at the world origin). */
  planetRadius: number;
  /** Normalised direction from the planet centre toward the sun. */
  sunDirection: THREE.Vector3;
  /** Atmosphere shell thickness above the surface, in metres. */
  atmosphereThickness?: number;
  /** Scalar multiplier on the incoming sunlight. */
  sunIntensity?: number;
  /** Primary (view-ray) raymarch step count. */
  primarySteps?: number;
  /** Secondary (light-ray) raymarch step count. */
  lightSteps?: number;
  /** Resolution of the sun-view depth map used for atmospheric shadows. */
  shadowMapSize?: number;
  /** Toggle terrain-cast atmospheric shadows. */
  shadows?: boolean;
  /** Toggle the whole effect. */
  enabled?: boolean;
}

interface Pipeline {
  postProcessing: THREE.RenderPipeline;
  uniforms: AtmosphereUniforms;
  sunCamera: THREE.OrthographicCamera;
  sunRenderTarget: THREE.RenderTarget;
}

const _cameraWorldPosition = new THREE.Vector3();
const _subSolarPoint = new THREE.Vector3();
const _worldUpY = new THREE.Vector3(0, 1, 0);
const _worldUpZ = new THREE.Vector3(0, 0, 1);

/**
 * Atmospheric scattering rendered as a WebGPU post-processing effect.
 *
 * This component takes over the render loop (via a positive `useFrame`
 * priority): each frame it renders a depth map of the scene from the sun's
 * point of view, then composites the raymarched atmosphere over the beauty
 * pass. The sun depth map lets the atmosphere shader occlude in-scattered light
 * behind terrain, so mountains cast shadows through the volume of the sky.
 */
export const Atmosphere: React.FC<AtmosphereProps> = ({
  planetRadius,
  sunDirection,
  atmosphereThickness = 120_000,
  sunIntensity = 22,
  primarySteps = 20,
  lightSteps = 6,
  shadowMapSize = 2048,
  shadows = true,
  enabled = true,
}) => {
  const { gl, scene, camera } = useThree();

  const pipeline = React.useMemo<Pipeline>(() => {
    // Beauty pass: the full scene rendered from the main camera.
    const scenePass = pass(scene, camera);
    const colorNode = scenePass.getTextureNode("output");
    const depthNode = scenePass.getTextureNode("depth");

    // Sun-view depth target. A normal render into this target captures the
    // displaced terrain geometry (the LOD tiles don't set `castShadow`, so the
    // renderer's built-in shadow map would be empty — we roll our own instead).
    const sunDepthTexture = new THREE.DepthTexture(shadowMapSize, shadowMapSize);
    const sunRenderTarget = new THREE.RenderTarget(shadowMapSize, shadowMapSize, {
      depthTexture: sunDepthTexture,
    });
    sunRenderTarget.texture.name = "atmosphere-sun-depth";
    const sunDepthNode = texture(sunDepthTexture);

    const sunCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);

    const { outputNode, uniforms } = createAtmosphereNode(
      colorNode,
      depthNode,
      sunDepthNode,
      {
        planetRadius,
        atmosphereThickness,
        sunIntensity,
        primarySteps,
        lightSteps,
      },
    );

    const postProcessing = new THREE.RenderPipeline(
      gl as unknown as THREE.Renderer,
    );
    postProcessing.outputNode = outputNode;

    return { postProcessing, uniforms, sunCamera, sunRenderTarget };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gl,
    scene,
    camera,
    planetRadius,
    atmosphereThickness,
    sunIntensity,
    primarySteps,
    lightSteps,
    shadowMapSize,
  ]);

  React.useEffect(() => {
    return () => {
      pipeline.postProcessing.dispose();
      pipeline.sunRenderTarget.dispose();
    };
  }, [pipeline]);

  useFrame(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;

    if (!enabled) {
      renderer.render(scene, camera);
      return;
    }

    const { postProcessing, uniforms, sunCamera, sunRenderTarget } = pipeline;
    const sunDir = sunDirection.clone().normalize();

    camera.updateMatrixWorld();
    camera.getWorldPosition(_cameraWorldPosition);
    const altitude = Math.max(_cameraWorldPosition.length() - planetRadius, 1);

    // Focus the sun's orthographic frustum on the surface point beneath the
    // camera, tightening it as we descend so nearby mountains resolve enough
    // detail to throw visible shadows; widen it when viewing from orbit.
    const extent = THREE.MathUtils.clamp(
      altitude * 2.0,
      8_000,
      planetRadius * 0.5,
    );
    _subSolarPoint.copy(_cameraWorldPosition).normalize().multiplyScalar(planetRadius);
    const focusDistance = planetRadius;

    sunCamera.up.copy(Math.abs(sunDir.y) > 0.99 ? _worldUpZ : _worldUpY);
    sunCamera.position.copy(_subSolarPoint).addScaledVector(sunDir, focusDistance);
    sunCamera.lookAt(_subSolarPoint);
    sunCamera.left = -extent;
    sunCamera.right = extent;
    sunCamera.top = extent;
    sunCamera.bottom = -extent;
    sunCamera.near = Math.max(1, focusDistance - extent - 50_000);
    sunCamera.far = focusDistance + extent + 50_000;
    sunCamera.updateProjectionMatrix();
    sunCamera.updateMatrixWorld(true);

    // Render the sun-view depth map. Drop the cube background for this pass so
    // we only pay for geometry (the background writes no depth anyway).
    const previousRenderTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    scene.background = null;
    renderer.setRenderTarget(sunRenderTarget);
    renderer.render(scene, sunCamera);
    renderer.setRenderTarget(previousRenderTarget);
    scene.background = previousBackground;

    // Refresh per-frame uniforms.
    uniforms.uCameraPosition.value.copy(_cameraWorldPosition);
    uniforms.uCameraWorldMatrix.value.copy(camera.matrixWorld);
    uniforms.uCameraProjectionInverse.value.copy(
      (camera as THREE.PerspectiveCamera).projectionMatrixInverse,
    );
    uniforms.uCameraNear.value = (camera as THREE.PerspectiveCamera).near;
    uniforms.uCameraFar.value = (camera as THREE.PerspectiveCamera).far;
    uniforms.uSunDirection.value.copy(sunDir);
    uniforms.uSunIntensity.value = sunIntensity;
    uniforms.uSunViewMatrix.value.copy(sunCamera.matrixWorldInverse);
    uniforms.uSunProjectionMatrix.value.copy(sunCamera.projectionMatrix);
    uniforms.uSunNear.value = sunCamera.near;
    uniforms.uSunFar.value = sunCamera.far;
    const bias = Math.max(100, extent * 0.01);
    uniforms.uShadowBias.value = bias;
    uniforms.uShadowSoftness.value = bias * 2;
    uniforms.uShadowEnabled.value = shadows ? 1 : 0;

    postProcessing.render();
  }, 1);

  return null;
};
