import { useThree } from "@react-three/fiber";
import { EffectComposer, Noise } from "@react-three/postprocessing";

export const Post: React.FC<React.PropsWithChildren> = ({ children }) => {
  const gl = useThree((state) => state.gl);
  // workaround for https://github.com/pmndrs/drei/issues/803
  gl.autoClear = true;
  const useEffectComposer = true;

  return useEffectComposer ? (
    <>
      <EffectComposer>
        {/* <N8AO /> */}
        <Noise opacity={0.01} />
        {/* <Depth /> */}
      </EffectComposer>
      {children}
    </>
  ) : null;
};
