import { useEffect, useRef } from "react";

export type CharacterInputState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
};

const INITIAL_INPUT_STATE: CharacterInputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
};

const KEY_MAP: Record<string, keyof CharacterInputState> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "jump",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
};

export function useKeyboardInput(enabled = true) {
  const inputRef = useRef<CharacterInputState>({ ...INITIAL_INPUT_STATE });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const mapped = KEY_MAP[event.code];
      if (!mapped) return;
      inputRef.current[mapped] = true;
      event.preventDefault();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const mapped = KEY_MAP[event.code];
      if (!mapped) return;
      inputRef.current[mapped] = false;
      event.preventDefault();
    };

    const onBlur = () => {
      inputRef.current = { ...INITIAL_INPUT_STATE };
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);

  return inputRef;
}
