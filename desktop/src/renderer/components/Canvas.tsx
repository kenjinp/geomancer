import { Canvas as ThreeCanvas, useThree } from "@react-three/fiber";
import { PropsWithChildren, Suspense, useState } from "react";
import { Color } from "three";
// @ts-expect-error
import { OrbitCamera } from "./OrbitCamera";

const Background: React.FC = () => {
  useThree((state) => {
    state.scene.background = new Color("black");
  });
  return null;
};

export const Canvas: React.FC<PropsWithChildren> = ({ children }) => {
  const [frameloop, setFrameloop] = useState<"never" | "always">("never");

  return (
    <ThreeCanvas
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
        <OrbitCamera planetRadius={2048} />
        <ambientLight intensity={Math.PI / 2} />
        {/* <spotLight
          position={[2048 * 10, 2048 * 10, 2048 * 10]}
          angle={0.15}
          penumbra={1}
          decay={0}
          intensity={Math.PI}
        />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} /> */}
      </Suspense>
      <Background />
    </ThreeCanvas>
  );
};
