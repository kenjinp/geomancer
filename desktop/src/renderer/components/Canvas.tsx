import { AU, EARTH_AUTHALIC_RADIUS } from "@/constants";
import { Stars } from "@react-three/drei";
import { Canvas as ThreeCanvas, useThree } from "@react-three/fiber";
import { PropsWithChildren, Suspense, useEffect } from "react";
import { Vector3 } from "three";
import { OrbitCamera } from "./OrbitCamera";
import { Post } from "./post/Post";
import { SpaceBox } from "./space-box/SpaceBox";

const MAX_RENDER_WIDTH = 1024; // Maximum width in pixels

const Background: React.FC = () => {
  useThree((state) => {
    // state.scene.background = new Color("#3D4058");
  });
  return null;
};

const RenderInfo: React.FC = () => {
  const { size, viewport } = useThree();

  useEffect(() => {
    const pixelRatio = window.devicePixelRatio;
    console.log("Pixel dimensions:", {
      width: size.width,
      height: size.height,
      pixelRatio,
      maxWidth: MAX_RENDER_WIDTH,
      effectivePixels: {
        width: size.width * pixelRatio,
        height: size.height * pixelRatio,
      },
    });
    console.log("Viewport dimensions:", viewport);
  }, [size, viewport]);

  return null;
};

export const Canvas: React.FC<PropsWithChildren> = ({ children }) => {
  const radius = EARTH_AUTHALIC_RADIUS;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <ThreeCanvas
        id="three-canvas"
        style={{
          width: "100%",
          height: "100%",
        }}
        camera={{
          near: 0.1,
          far: Number.MAX_SAFE_INTEGER,
        }}
        gl={{
          logarithmicDepthBuffer: true,
          antialias: true,
          stencil: true,
          depth: true,
          alpha: true,
        }}
        dpr={[1, 1]}
        performance={{ min: 0.5 }}
        shadows="soft"
        shadow-camera-far={1000000}
        shadow-camera-left={-20000}
        shadow-camera-right={20000}
        shadow-camera-top={20000}
        shadow-camera-bottom={-20000}
      >
        <Suspense fallback={null}>
          <Post>
            <SpaceBox />
            <group
              scale={new Vector3(1, 1, 1).multiplyScalar(AU).multiplyScalar(10)}
            >
              <Stars saturation={1} count={10_000} />
            </group>

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
          </Post>
        </Suspense>
        <Background />
        <RenderInfo />
      </ThreeCanvas>
    </div>
  );
};
