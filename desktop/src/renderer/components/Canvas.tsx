import { extend, Canvas as ThreeCanvas } from "@react-three/fiber";
import { PropsWithChildren, Suspense } from "react";
import type { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.js";
import * as THREE from "three/webgpu";

import { EARTH_AUTHALIC_RADIUS } from "@/constants";

import { OrbitCamera } from "./OrbitCamera";
import { SpaceBox } from "./space-box/SpaceBox";

extend(THREE as Record<string, unknown>);

export const Canvas: React.FC<PropsWithChildren> = ({ children }) => {
  const radius = EARTH_AUTHALIC_RADIUS;

  return (
    <ThreeCanvas
      id="three-canvas"
      style={{ height: "100vh" }}
      camera={{
        near: 0.1,
        far: Number.MAX_SAFE_INTEGER,
      }}
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(props as WebGPURendererParameters);
        renderer.logarithmicDepthBuffer = true;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        await renderer.init();
        return renderer;
      }}
      shadows="soft"
      shadow-camera-far={1000000}
      shadow-camera-left={-20000}
      shadow-camera-right={20000}
      shadow-camera-top={20000}
      shadow-camera-bottom={-20000}
    >
      <Suspense fallback={null}>
        <SpaceBox />
        {children}
        <OrbitCamera planetRadius={radius} />
        <ambientLight intensity={Math.PI / 90} />
        <spotLight
          position={[radius * 10, (radius * 10) / 2, radius * 10]}
          angle={0.15}
          penumbra={1}
          decay={0}
          intensity={Math.PI}
        />
      </Suspense>
    </ThreeCanvas>
  );
};
