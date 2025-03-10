import { EARTH_AUTHALIC_RADIUS } from "@/constants";
import { runTaskGraph } from "@/tasks/TaskGraph";
import { Html } from "@react-three/drei";
import { useEffect, useState } from "react";
import { TerrainRenderer } from "../components/TerrainRenderer";

export const Home: React.FC = () => {
  const radius = EARTH_AUTHALIC_RADIUS;
  const [checkingWebGPU, setCheckingWebGPU] = useState(true);
  const [hasWebGPU, setHasWebGPU] = useState(false);

  useEffect(() => {
    runTaskGraph();
    const checkWebGPU = async () => {
      setCheckingWebGPU(true);
      if (!navigator.gpu) {
        setHasWebGPU(false);
        setCheckingWebGPU(false);
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          return setHasWebGPU(false);
        }
        setHasWebGPU(true);
      } catch (e) {
        setHasWebGPU(false);
      } finally {
        setCheckingWebGPU(false);
      }
    };

    checkWebGPU();
  }, []);

  if (checkingWebGPU) {
    return (
      <Html center>
        <div className="flex items-center justify-center h-full w-[500px] max-w-[90vw]">
          <div
            className="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded relative"
            role="alert"
          >
            <strong className="font-bold">
              Checking device compatibility...
            </strong>
            <span className="block sm:inline"></span>
          </div>
        </div>
      </Html>
    );
  }

  if (!hasWebGPU) {
    return (
      <Html center>
        <div className="flex items-center justify-center h-full w-[500px] max-w-[90vw]">
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
            role="alert"
          >
            <strong className="font-bold">WebGPU Not Available! </strong>
            <span className="block sm:inline">
              This application requires WebGPU support. Please use a compatible
              browser.
            </span>
          </div>
        </div>
      </Html>
    );
  }

  return (
    <group>
      {/* <Perf position="bottom-right" /> */}
      <TerrainRenderer radius={radius} />
      {/* <CubeVisualizer scale={radius} /> */}
    </group>
  );
};
