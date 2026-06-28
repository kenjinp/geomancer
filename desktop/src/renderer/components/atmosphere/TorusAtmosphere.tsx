import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import { pass, texture } from "three/tsl";
import * as THREE from "three/webgpu";

import {
  createTorusAtmosphereNode,
  type TorusAtmosphereUniforms,
} from "../../tsl/torusAtmosphere";
import { usePostProcessing } from "../post/PostProcessing";

export interface TorusAtmosphereProps {
  majorRadius: number;
  minorRadius: number;
  center?: THREE.Vector3;
  /** Normalised direction from the torus center toward the sun. */
  sunDirection: THREE.Vector3;
  atmosphereThickness?: number;
  sunIntensity?: number;
  primarySteps?: number;
  lightSteps?: number;
  shadowMapSize?: number;
  shadows?: boolean;
  enabled?: boolean;
}

interface TorusAtmosphereResources {
  uniforms: TorusAtmosphereUniforms;
  sunCamera: THREE.OrthographicCamera;
  sunRenderTarget: THREE.RenderTarget;
  outputNode: unknown;
}

const _cameraWorldPosition = new THREE.Vector3();
const _surfaceFocus = new THREE.Vector3();
const _surfaceNormal = new THREE.Vector3();
const _ringCenter = new THREE.Vector3();
const _torusOffset = new THREE.Vector3();
const _worldUpY = new THREE.Vector3(0, 1, 0);
const _worldUpZ = new THREE.Vector3(0, 0, 1);

function closestTorusSurfacePoint(
  point: THREE.Vector3,
  center: THREE.Vector3,
  majorRadius: number,
  minorRadius: number,
): { point: THREE.Vector3; normal: THREE.Vector3; signedAltitude: number } {
  _torusOffset.copy(point).sub(center);
  let theta = Math.atan2(_torusOffset.x, _torusOffset.z);
  if (!Number.isFinite(theta)) theta = 0;

  _ringCenter.set(
    Math.sin(theta) * majorRadius,
    0,
    Math.cos(theta) * majorRadius,
  );
  _ringCenter.add(center);

  _surfaceNormal.copy(point).sub(_ringCenter);
  if (_surfaceNormal.lengthSq() < 1e-6) {
    _surfaceNormal.copy(_torusOffset);
    _surfaceNormal.y = 0;
    if (_surfaceNormal.lengthSq() < 1e-6) _surfaceNormal.set(0, 1, 0);
  }
  _surfaceNormal.normalize();
  _surfaceFocus.copy(_ringCenter).addScaledVector(_surfaceNormal, minorRadius);

  return {
    point: _surfaceFocus,
    normal: _surfaceNormal,
    signedAltitude: point.clone().sub(_surfaceFocus).dot(_surfaceNormal),
  };
}

export const TorusAtmosphere: React.FC<TorusAtmosphereProps> = ({
  majorRadius,
  minorRadius,
  center,
  sunDirection,
  atmosphereThickness = 120_000,
  sunIntensity = 22,
  primarySteps = 36,
  lightSteps = 8,
  shadowMapSize = 2048,
  shadows = true,
  enabled = true,
}) => {
  const { gl, scene, camera } = useThree();
  const { pipeline, setSceneNode } = usePostProcessing();
  const torusCenter = React.useMemo(
    () => center?.clone() ?? new THREE.Vector3(),
    [center],
  );

  const atmo = React.useMemo<TorusAtmosphereResources>(() => {
    const scenePass = pass(scene, camera);
    const colorNode = scenePass.getTextureNode("output");
    const depthNode = scenePass.getTextureNode("depth");

    const sunDepthTexture = new THREE.DepthTexture(shadowMapSize, shadowMapSize);
    const sunRenderTarget = new THREE.RenderTarget(shadowMapSize, shadowMapSize, {
      depthTexture: sunDepthTexture,
    });
    sunRenderTarget.texture.name = "torus-atmosphere-sun-depth";
    const sunDepthNode = texture(sunDepthTexture);

    const sunCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);

    const { outputNode, uniforms } = createTorusAtmosphereNode(
      colorNode,
      depthNode,
      sunDepthNode,
      {
        majorRadius,
        minorRadius,
        center: torusCenter,
        atmosphereThickness,
        sunIntensity,
        primarySteps,
        lightSteps,
      },
    );

    const renderer = gl as unknown as THREE.WebGPURenderer;
    if (renderer.toneMapping === THREE.NoToneMapping) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
    }

    return { uniforms, sunCamera, sunRenderTarget, outputNode };
  }, [
    gl,
    scene,
    camera,
    majorRadius,
    minorRadius,
    torusCenter,
    atmosphereThickness,
    sunIntensity,
    primarySteps,
    lightSteps,
    shadowMapSize,
  ]);

  React.useEffect(() => {
    setSceneNode(atmo.outputNode);
  }, [setSceneNode, atmo]);

  React.useEffect(() => {
    return () => {
      atmo.sunRenderTarget.dispose();
    };
  }, [atmo]);

  useFrame(() => {
    const renderer = gl as unknown as THREE.WebGPURenderer;

    if (!enabled) {
      renderer.render(scene, camera);
      return;
    }

    const { uniforms, sunCamera, sunRenderTarget } = atmo;
    const sunDir = sunDirection.clone().normalize();
    const outerRadius = majorRadius + minorRadius + atmosphereThickness;

    camera.updateMatrixWorld();
    camera.getWorldPosition(_cameraWorldPosition);

    const surface = closestTorusSurfacePoint(
      _cameraWorldPosition,
      torusCenter,
      majorRadius,
      minorRadius,
    );
    const altitude = Math.max(Math.abs(surface.signedAltitude), 1);

    const extent = THREE.MathUtils.clamp(
      altitude * 2.0,
      8_000,
      outerRadius * 0.5,
    );
    const focusDistance = outerRadius;

    sunCamera.up.copy(Math.abs(sunDir.y) > 0.99 ? _worldUpZ : _worldUpY);
    sunCamera.position.copy(surface.point).addScaledVector(sunDir, focusDistance);
    sunCamera.lookAt(surface.point);
    sunCamera.left = -extent;
    sunCamera.right = extent;
    sunCamera.top = extent;
    sunCamera.bottom = -extent;
    sunCamera.near = Math.max(1, focusDistance - extent - 50_000);
    sunCamera.far = focusDistance + extent + 50_000;
    sunCamera.updateProjectionMatrix();
    sunCamera.updateMatrixWorld(true);

    const previousRenderTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    scene.background = null;
    renderer.setRenderTarget(sunRenderTarget);
    renderer.render(scene, sunCamera);
    renderer.setRenderTarget(previousRenderTarget);
    scene.background = previousBackground;

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
    const shadowFade = THREE.MathUtils.clamp(
      1 - (altitude - outerRadius * 0.02) / (outerRadius * 0.13),
      0,
      1,
    );
    uniforms.uShadowEnabled.value = shadows ? shadowFade : 0;

    pipeline.render();
  }, 1);

  return null;
};
