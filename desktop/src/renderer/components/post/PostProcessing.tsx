import { useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three/webgpu";

/** A screen-space effect: wraps the current output node and returns a new one. */
export type PostEffect = (input: any) => any;

interface PostProcessingValue {
  /** The singleton WebGPU pipeline that composites the scene to the screen. */
  pipeline: THREE.RenderPipeline;
  /**
   * Set the base image node — the scene (plus any in-pass effects like the
   * atmosphere) that screen-space effects are layered on top of.
   */
  setSceneNode: (node: unknown | null) => void;
  /**
   * Register a screen-space effect that wraps the current output node. Returns
   * an unregister function (call on unmount).
   */
  registerEffect: (id: string, effect: PostEffect) => () => void;
}

/**
 * The scene is composited through a single WebGPU `RenderPipeline`. Effects are
 * nodes that each read the previous stage's texture, so they must compose onto
 * the *same* pipeline (rendering N independent pipelines would render the scene
 * N times and only the last would survive).
 *
 * This context owns that singleton and a tiny effect chain: one component sets
 * the base scene node (`setSceneNode`) and any number of others contribute
 * screen-space effects (`registerEffect`). The output node is recomposed as
 * `outputNode = effects.reduce((node, fx) => fx(node), sceneNode)` whenever the
 * base or the effect set changes, which keeps each effect (bloom, ...) in its
 * own component instead of hard-wired into whichever one owns the render loop.
 */
const PostProcessingContext = React.createContext<PostProcessingValue | null>(
  null,
);

export const PostProcessingProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const renderer = useThree((state) => state.gl);

  const [pipeline] = React.useState(
    () => new THREE.RenderPipeline(renderer as unknown as THREE.Renderer),
  );

  const [sceneNode, setSceneNode] = React.useState<unknown | null>(null);
  const [effects, setEffects] = React.useState<ReadonlyMap<string, PostEffect>>(
    () => new Map(),
  );

  const registerEffect = React.useCallback(
    (id: string, effect: PostEffect) => {
      setEffects((prev) => new Map(prev).set(id, effect));
      return () => {
        setEffects((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      };
    },
    [],
  );

  React.useEffect(() => {
    if (sceneNode == null) return;
    let node = sceneNode as any;
    for (const effect of effects.values()) {
      node = effect(node);
    }
    pipeline.outputNode = node;
    pipeline.needsUpdate = true;
  }, [pipeline, sceneNode, effects]);

  React.useEffect(() => () => pipeline.dispose(), [pipeline]);

  const value = React.useMemo<PostProcessingValue>(
    () => ({ pipeline, setSceneNode, registerEffect }),
    [pipeline, registerEffect],
  );

  return (
    <PostProcessingContext.Provider value={value}>
      {children}
    </PostProcessingContext.Provider>
  );
};

/** Access the scene's singleton post-processing pipeline and effect chain. */
export function usePostProcessing(): PostProcessingValue {
  const value = React.useContext(PostProcessingContext);
  if (!value) {
    throw new Error(
      "usePostProcessing must be used within a <PostProcessingProvider>",
    );
  }
  return value;
}
