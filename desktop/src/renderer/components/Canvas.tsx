import { AU, EARTH_AUTHALIC_RADIUS } from "@/constants";
import { Stars } from "@react-three/drei";
import { Canvas as ThreeCanvas, useThree } from "@react-three/fiber";
import { PropsWithChildren, Suspense } from "react";
import { Vector3 } from "three";
import { OrbitCamera } from "./OrbitCamera";
import { Post } from "./post/Post";
import { SpaceBox } from "./space-box/SpaceBox";

const Background: React.FC = () => {
  useThree((state) => {
    // state.scene.background = new Color("#3D4058");
  });
  return null;
};

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
      gl={{
        logarithmicDepthBuffer: true,
        antialias: true,
        stencil: true,
        depth: true,
        alpha: true,
      }}
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
          {/* <ambientLight intensity={Math.PI / 2} />
          <spotLight
            position={[radius * 10, radius * 10, radius * 10]}
            angle={0.15}
            penumbra={1}
            decay={0}
            intensity={Math.PI / 4}
          /> */}
        </Post>
      </Suspense>
      <Background />
    </ThreeCanvas>
  );
};
