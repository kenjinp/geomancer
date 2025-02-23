import { Canvas as ThreeCanvas, useThree } from "@react-three/fiber";
import { PropsWithChildren, Suspense, useState } from "react";
import { Color } from "three";
// @ts-expect-error
import { EARTH_AUTHALIC_RADIUS } from "@/constants";
import { OrbitCamera } from "./OrbitCamera";

const Background: React.FC = () => {
  useThree((state) => {
    state.scene.background = new Color("#3D4058");
  });
  return null;
};

export const Canvas: React.FC<PropsWithChildren> = ({ children }) => {
  const [frameloop, setFrameloop] = useState<"never" | "always">("never");
  const radius = EARTH_AUTHALIC_RADIUS;

  return (
    <ThreeCanvas
      id="three-canvas"
      style={{ height: "100vh" }}
      // frameloop={frameloop}
      camera={{
        near: 0.1,
        far: Number.MAX_SAFE_INTEGER,
      }}
      gl={{
        logarithmicDepthBuffer: true,
      }}

      // gl={(canvas) => {
      //   const renderer = new WebGPURenderer({
      //     canvas,
      //     powerPreference: "high-performance",
      //     antialias: true,
      //     alpha: true,
      //     logarithmicDepthBuffer: true,
      //   });
      //   renderer.init().then(() => setFrameloop("always"));
      //   renderer.xr = { addEventListener: () => {} };
      //   return renderer;
      // }}
    >
      <Suspense fallback={null}>
        {children}
        <OrbitCamera planetRadius={radius} />
        <ambientLight intensity={Math.PI / 2} />
        <spotLight
          position={[radius * 10, radius * 10, radius * 10]}
          angle={0.15}
          penumbra={1}
          decay={0}
          intensity={Math.PI / 4}
        />
        {/* <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} /> */}
      </Suspense>
      <Background />
    </ThreeCanvas>
  );
};
