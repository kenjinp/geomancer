import { useThree } from "@react-three/fiber";
import * as React from "react";
import { Color, CubeTextureLoader } from "three";

export const SpaceBox: React.FC<React.PropsWithChildren<{ hideBackground?: boolean }>> = ({
  hideBackground,
  children,
}) => {
  const { scene } = useThree();
  React.useEffect(() => {
    const back = `/textures/skybox/back.png`;
    const bottom = `/textures/skybox/bottom.png`;
    const front = `/textures/skybox/front.png`;
    const left = `/textures/skybox/left.png`;
    const right = `/textures/skybox/right.png`;
    const top = `/textures/skybox/top.png`;

    const urls = [right, left, top, bottom, front, back];

    const cube = new CubeTextureLoader().load(urls);
    if (hideBackground) {
      scene.background = new Color(0x000000);
      return;
    }
    scene.castShadow = true;
    scene.background = cube;
  }, [hideBackground]);

  return <>{children}</>;
};
