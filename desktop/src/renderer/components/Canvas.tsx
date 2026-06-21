import { extend, Canvas as ThreeCanvas } from "@react-three/fiber";
import { PropsWithChildren, Suspense } from "react";
import type { WebGPURendererParameters } from "three/src/renderers/webgpu/WebGPURenderer.js";
import * as THREE from "three/webgpu";

import { SpaceBox } from "./space-box/SpaceBox";

extend(THREE as Record<string, unknown>);

export const Canvas: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <ThreeCanvas
      id="three-canvas"
      style={{ height: "100vh" }}
      camera={{
        near: 0.1,
        far: Number.MAX_SAFE_INTEGER,
      }}
      gl={async (props) => {
        props.alpha = true;
        props.antialias = true;
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
        {/* The planet's single sun lives in TerrainRenderer as a directionalLight
            aligned to the atmosphere's sunDirection. A second light here lit the
            sphere from a different angle, producing a mismatched terminator that
            split the planet into bright/dim sections. */}
        <ambientLight intensity={Math.PI / 90} />
      </Suspense>
    </ThreeCanvas>
  );
};
