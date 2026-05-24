import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/ui/utilts";

export const MouseFollower: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
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
        isMouseOverCanvas ? "hidden" : "flex"
      )}
      style={{
        transform: "translate(16px, -32px)",
      }}
    >
      {children}
    </div>
  );
};
