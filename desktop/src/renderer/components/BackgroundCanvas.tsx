import { Canvas as R3fCanvas, useFrame, useThree } from "@react-three/fiber";
import React, { Suspense, useEffect, useRef, useState } from "react";
import { Color } from "three";
import { WebGPURenderer } from "three/webgpu";
import type { Mesh } from "three";
import * as TSL from "three/tsl";
import { OrbitControls } from "@react-three/drei";
// @ts-expect-error
import WebGPU from "three/examples/jsm/capabilities/WebGPU";

function Box(props: any) {
  const meshRef = useRef<Mesh>(null!);
  const [hovered, setHover] = useState(false);
  const [active, setActive] = useState(false);
  const { gl } = useThree();

  useFrame((_, delta) => (meshRef.current.rotation.x += delta));

  useEffect(() => {
    console.log(WebGPU.isAvailable());
    console.log(TSL.sqrt(2));
    // @ts-expect-error
    console.log(
      gl.backend.isWebGPUBackend ? "WebGPU Backend" : "WebGL Backend"
    );
  }, []);

  return (
    <mesh
      {...props}
      ref={meshRef}
      scale={active ? 1.5 : 1}
      onClick={() => setActive(!active)}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? "hotpink" : "orange"} />
    </mesh>
  );
}

const Background: React.FC = () => {
  useThree((state) => {
    state.scene.background = new Color("#151613");
  });
  return null;
};

export const Canvas: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [frameloop, setFrameloop] = useState<"never" | "always">("never");
  return (
    <R3fCanvas
      // gl={{
      //   logarithmicDepthBuffer: true,
      // }}
      frameloop={frameloop}
      gl={(canvas) => {
        // @ts-expect-error
        const renderer = new WebGPURenderer({ canvas });
        renderer.init().then(() => setFrameloop("always"));
        // @ts-expect-error
        renderer.xr = { addEventListener: () => {} };
        return renderer;
      }}
      resize={{ debounce: 0 }}
      camera={{
        near: 0.01,
        far: Number.MAX_SAFE_INTEGER,
        // position: [0, 0, -20],
        // position: [-778.8166673411616, 5553.223843712609, 9614.949713806403],
      }}
      shadows="soft"
      shadow-camera-far={1000000}
      shadow-camera-left={-10000}
      shadow-camera-right={10000}
      shadow-camera-top={10000}
      shadow-camera-bottom={-10000}
    >
      <Suspense fallback={null}>
        {children}
        <OrbitControls />
        <ambientLight intensity={Math.PI / 2} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.15}
          penumbra={1}
          decay={0}
          intensity={Math.PI}
        />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
        <Box position={[-1.2, 0, 0]} />
        <Box position={[1.2, 0, 0]} />
      </Suspense>
      <Background />
    </R3fCanvas>
  );
};
