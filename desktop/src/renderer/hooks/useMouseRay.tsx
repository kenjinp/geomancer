import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Raycaster, Vector2 } from "three";

export const useMouseRay = (onMouseMove: (ray: Raycaster) => void) => {
  const { camera, size } = useThree();
  const raycaster = useRef(new Raycaster());
  const mouse = useRef(new Vector2());

  useEffect(() => {
    const handleMouseMove = (event) => {
      // Calculate normalized device coordinates
      mouse.current.x = (event.clientX / size.width) * 2 - 1;
      mouse.current.y = -(event.clientY / size.height) * 2 + 1;

      // Update raycaster
      raycaster.current.setFromCamera(mouse.current, camera);

      onMouseMove(raycaster.current);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.addEventListener("mousemove", handleMouseMove);
    };
  }, [camera, size, onMouseMove]);
};
