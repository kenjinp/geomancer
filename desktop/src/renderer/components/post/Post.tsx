/** Passthrough wrapper — WebGL postprocessing removed for WebGPU renderer. */
export const Post: React.FC<React.PropsWithChildren> = ({ children }) => {
  return <>{children}</>;
};
