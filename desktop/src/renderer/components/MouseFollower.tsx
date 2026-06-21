import type { TerrainHandle } from "@hello-terrain/react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { Raycaster, Vector2, Vector3 } from "three";

import { cn } from "@/lib/ui/utilts";

export const MouseFollower: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
  const mouseFollowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const followElement = document.getElementById("three-canvas");
      const bounds = followElement.getBoundingClientRect();

      if (mouseFollowRef.current) {
        mouseFollowRef.current.style.top = `${event.clientY}px`;
        mouseFollowRef.current.style.left = `${event.clientX}px`;
      }

      if (event.clientX < bounds.left || event.clientX > bounds.right) {
        setIsMouseOverCanvas(true);
        return;
      }
      setIsMouseOverCanvas(false);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      id="mouse-follower"
      ref={mouseFollowRef}
      className={cn(
        "text-shadow fixed pointer-events-none z-[100]",
        isMouseOverCanvas ? "hidden" : "flex",
      )}
      style={{
        transform: "translate(16px, -32px)",
      }}
    >
      {children}
    </div>
  );
};

interface MouseAltitudeIndicatorProps {
  /** Terrain handle providing the hello-terrain CPU raycast API. */
  terrain?: TerrainHandle;
}

interface AltitudeHit {
  /** World-space terrain point under the cursor. */
  point: Vector3;
  /** Distance along the camera->cursor ray to the terrain (altitude above terrain). */
  distance: number;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toLocaleString(undefined, {
      maximumFractionDigits: meters >= 100_000 ? 0 : 1,
    })} km`;
  }
  return `${meters.toLocaleString(undefined, { maximumFractionDigits: 0 })} m`;
}

/**
 * Floating readout that hovers next to the cursor and reports the camera's
 * altitude above the *terrain* (not the sphere datum). The value is the length
 * of the ray cast from the camera, through the mouse, to the terrain surface,
 * resolved with the hello-terrain raycast API.
 *
 * Must be rendered inside the R3F `<Canvas>` (it relies on `useThree`).
 */
export const MouseAltitudeIndicator: React.FC<MouseAltitudeIndicatorProps> = ({ terrain }) => {
  const { camera } = useThree();
  const [hit, setHit] = useState<AltitudeHit | null>(null);

  const raycaster = useRef(new Raycaster());
  const ndc = useRef(new Vector2());
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Drive the raycast off the render loop (once per rendered frame) using the
  // last known cursor position. This keeps the reading correct while the camera
  // moves even if the mouse is stationary.
  useFrame(() => {
    const event = pointer.current;
    const bounds = document.getElementById("three-canvas")?.getBoundingClientRect();
    const terrainRaycast = terrain?.runtime.raycast;

    if (
      !event ||
      !bounds ||
      !terrainRaycast ||
      // Hide the readout while the cursor is outside the canvas.
      event.x < bounds.left ||
      event.x > bounds.right ||
      event.y < bounds.top ||
      event.y > bounds.bottom
    ) {
      setHit(null);
      return;
    }

    ndc.current.x = ((event.x - bounds.left) / bounds.width) * 2 - 1;
    ndc.current.y = -((event.y - bounds.top) / bounds.height) * 2 + 1;
    raycaster.current.setFromCamera(ndc.current, camera);

    const result = terrainRaycast.pick(raycaster.current.ray);
    setHit(result ? { point: result.position.clone(), distance: result.distance } : null);
  });

  if (!hit) return null;

  return (
    <Html position={hit.point} style={{ pointerEvents: "none" }} zIndexRange={[100, 0]}>
      <div
        className="text-shadow whitespace-nowrap rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white"
        style={{ transform: "translate(16px, -32px)" }}
      >
        {formatDistance(hit.distance)}
        <span className="ml-1 text-white/60">above terrain</span>
      </div>
    </Html>
  );
};
