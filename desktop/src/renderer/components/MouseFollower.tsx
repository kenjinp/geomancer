import { useEffect, useState } from "react";

interface MousePosition {
  x: number;
  y: number;
}

export const MouseFollower: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [mousePos, setMousePos] = useState<MousePosition>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({
        x: event.clientX,
        y: event.clientY,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      id="mouse-follower"
      className="fixed w-16 h-16 bg-blue-500 rounded-full opacity-50 pointer-events-none"
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
