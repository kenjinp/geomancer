import { cn } from "@/lib/ui/utilts";
import { useEffect, useState } from "react";

interface MousePosition {
  x: number;
  y: number;
}

export const MouseFollower: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [mousePos, setMousePos] = useState<MousePosition>({ x: 0, y: 0 });

  const [isMouseOverCanvas, setIsMouseOverCanvas] = useState(false);
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const followElement = document.getElementById("three-canvas");
      const bounds = followElement.getBoundingClientRect();
      setMousePos({
        x: event.clientX,
        y: event.clientY,
      });
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
      className={cn(
        "fixed w-16 h-16 bg-foreground rounded-full opacity-50 pointer-events-none z-[100]",
        isMouseOverCanvas ? "hidden" : "flex"
      )}
      style={{
        top: `${mousePos.y - 32}px`,
        left: `${mousePos.x - 32}px`,
        transform: "translate(32px, -32px)",
      }}
    >
      {children}
    </div>
  );
};
