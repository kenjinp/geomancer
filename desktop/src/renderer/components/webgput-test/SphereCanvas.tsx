import { useEffect, useRef } from "react";
import { SphereTessellation } from "./SphereTessellation";
import dat from "dat.gui";

const SphereCanvas = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const app = new SphereTessellation(canvas);
    app.compute();
    app.animate();

    // Handle window resize
    window.addEventListener("resize", () => {
      app.resize(window.innerWidth, window.innerHeight);
    });

    // Optional: Add UI controls
    const gui = new dat.GUI();
    gui
      .add(app.params, "levelOfDetail", 4, 64, 1)
      .onChange(() => app.compute());
    gui.add(app.params, "radius", 0.1, 2, 0.1).onChange(() => app.compute());

    return () => {
      gui.destroy();
      app.dispose();
    };
  }, []);

  return <canvas id="canvas" className="w-full h-full" ref={ref}></canvas>;
};

export default SphereCanvas;
