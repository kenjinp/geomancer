import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { Group, LoopOnce, LoopRepeat, MathUtils } from "three";
import { SkeletonUtils } from "three-stdlib";

import { rebaseSkinnedMeshes } from "@/renderer/tsl/cameraRelative";

import type { CharacterMotionState } from "./useSphereCharacterController";
import type { CharacterInputState } from "./useKeyboardInput";

// Relative path: absolute paths (e.g. "/assets/...") resolve against the
// file:// origin root in the packaged Electron app and fail to load.
const BOXMAN_URL = "assets/boxman.glb";

type CharacterModelProps = {
  turnRateRef: MutableRefObject<number>;
  speedRef: MutableRefObject<number>;
  motionState: CharacterMotionState;
  inputRef: MutableRefObject<CharacterInputState>;
};

function getBaseClipName(
  motionState: CharacterMotionState,
  horizontalSpeed: number,
) {
  if (motionState === "idle") return "idle";
  if (motionState === "walking") return "run";
  if (motionState === "sprinting") return "sprint";
  if (motionState === "jumping") {
    return horizontalSpeed > 1.5 ? "jump_running" : "jump_idle";
  }
  return "falling";
}

function getDirectionalStartClip(input: CharacterInputState) {
  const localX = (input.left ? 1 : 0) + (input.right ? -1 : 0);
  const localZ = (input.forward ? 1 : 0) + (input.backward ? -1 : 0);

  if (localZ < -0.3) {
    return localX >= 0 ? "start_back_left" : "start_back_right";
  }
  if (localX > 0.3) return "start_left";
  if (localX < -0.3) return "start_right";
  return "start_forward";
}

function isLoopingClip(clipName: string) {
  return (
    clipName === "idle" ||
    clipName === "run" ||
    clipName === "sprint" ||
    clipName === "jump_idle" ||
    clipName === "jump_running" ||
    clipName === "falling"
  );
}

export function CharacterModel({
  turnRateRef,
  speedRef,
  motionState,
  inputRef,
}: CharacterModelProps) {
  const tiltGroupRef = useRef<Group>(null);
  const gltf = useGLTF(BOXMAN_URL);
  const scene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, scene);
  const activeClipRef = useRef<string | null>(null);
  const elapsedRef = useRef(0);
  const previousWantsMoveRef = useRef(false);
  const transientClipRef = useRef<string | null>(null);
  const transientUntilRef = useRef(0);
  const rotateCooldownUntilRef = useRef(0);

  useEffect(() => {
    scene.traverse((child) => {
      const mesh = child as {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
        frustumCulled?: boolean;
      };
      if (mesh.isMesh) {
        // The directional light's shadow camera is sized for the whole planet
        // (40 km bounds, ~3e7 m away), so its shadow map is degenerate at human
        // scale and would render the character fully self-shadowed (black). The
        // fake contact disc grounds the character instead.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
      }
    });
    // Skinning bakes bone matrices into a float32 buffer; ~6.37e6 m from the
    // origin that quantises to ~0.5 m and shatters the mesh. Rebase the
    // skeleton to compute bone matrices mesh-relative in float64 so the
    // geometry stays crisp while still rendering through the standard view
    // pipeline (so it tracks the terrain instead of floating over it).
    rebaseSkinnedMeshes(scene);
  }, [scene]);

  useEffect(() => {
    return () => {
      Object.values(actions).forEach((action) => {
        if (!action) return;
        action.stop();
      });
    };
  }, [actions]);

  useFrame((_state, dt) => {
    elapsedRef.current += dt;

    const playClip = (clipName: string) => {
      if (activeClipRef.current === clipName) return;

      const nextAction = actions[clipName];
      if (!nextAction) return;

      nextAction.reset();
      nextAction.enabled = true;
      nextAction.clampWhenFinished = !isLoopingClip(clipName);
      nextAction.setLoop(
        isLoopingClip(clipName) ? LoopRepeat : LoopOnce,
        isLoopingClip(clipName) ? Infinity : 1,
      );
      nextAction.fadeIn(0.18);
      nextAction.play();

      if (clipName === "run") {
        nextAction.timeScale = 0.78;
      } else if (clipName === "sprint") {
        nextAction.timeScale = 1.05;
      } else {
        nextAction.timeScale = 1;
      }

      const previousClipName = activeClipRef.current;
      if (previousClipName && previousClipName !== clipName) {
        actions[previousClipName]?.fadeOut(0.18);
      }

      activeClipRef.current = clipName;
    };

    const input = inputRef.current;
    const wantsMove =
      input.forward || input.backward || input.left || input.right;
    const horizontalSpeed = speedRef.current;
    const now = elapsedRef.current;
    const baseClipName = getBaseClipName(motionState, horizontalSpeed);

    if (motionState === "jumping" || motionState === "falling") {
      transientClipRef.current = null;
      transientUntilRef.current = 0;
      playClip(baseClipName);
    } else {
      if (
        !previousWantsMoveRef.current &&
        wantsMove &&
        horizontalSpeed < 1.25 &&
        motionState !== "sprinting"
      ) {
        transientClipRef.current = getDirectionalStartClip(input);
        transientUntilRef.current = now + 0.34;
      } else if (
        previousWantsMoveRef.current &&
        !wantsMove &&
        horizontalSpeed > 0.45
      ) {
        transientClipRef.current = "stop";
        transientUntilRef.current = now + 0.28;
      } else if (
        !wantsMove &&
        motionState === "idle" &&
        horizontalSpeed < 0.08 &&
        now >= rotateCooldownUntilRef.current &&
        Math.abs(turnRateRef.current) > 1.25
      ) {
        transientClipRef.current =
          turnRateRef.current > 0 ? "rotate_left" : "rotate_right";
        transientUntilRef.current = now + 0.32;
        rotateCooldownUntilRef.current = now + 0.55;
      }

      if (transientClipRef.current != null && now < transientUntilRef.current) {
        playClip(transientClipRef.current);
      } else {
        transientClipRef.current = null;
        transientUntilRef.current = 0;
        playClip(baseClipName);
      }
    }

    previousWantsMoveRef.current = wantsMove;

    const tiltGroup = tiltGroupRef.current;
    if (!tiltGroup) return;

    const speed01 = Math.min(speedRef.current / 8.2, 1);
    const targetTilt = MathUtils.clamp(
      -turnRateRef.current * 0.06 * (0.45 + speed01),
      -0.32,
      0.32,
    );
    const blend = 1 - Math.exp(-12 * Math.min(dt, 1 / 20));
    tiltGroup.rotation.z = MathUtils.lerp(tiltGroup.rotation.z, targetTilt, blend);
    tiltGroup.position.y = Math.cos(Math.abs(tiltGroup.rotation.z) * 2) * 0.015;
  });

  return (
    <group>
      <group ref={tiltGroupRef}>
        <group position-y={-0.57}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(BOXMAN_URL);
