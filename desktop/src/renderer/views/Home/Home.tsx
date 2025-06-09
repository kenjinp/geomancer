import { EARTH_AUTHALIC_RADIUS } from "@/constants";
// import { Perf } from "r3f-perf";
import { Canvas } from "@/renderer/components/Canvas";
import { ColorRamp } from "@/renderer/components/ColorRamp";
import { Footer } from "@/renderer/components/footer/Footer";
import { MapModeBar } from "@/renderer/components/MapModeBar";
import { MouseFollower } from "@/renderer/components/MouseFollower";
import { subscribe } from "@/state/Context";
import { runTaskGraph } from "@/tasks/TaskGraph";
import { useEffect } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import { TerrainRenderer } from "../../components/TerrainRenderer";
export const Home: React.FC = () => {
  const radius = EARTH_AUTHALIC_RADIUS;

  useEffect(() => {
    subscribe((state, prevState) => {
      if (state.random.seed !== prevState.random.seed) {
        runTaskGraph();
      }
    });

    runTaskGraph();
  }, []);

  return (
    <div className="relative top-[32px] h-screen w-screen flex bg-gradient-to-t from-[#1E201A] to-[#282A23]">
      <PanelGroup direction="horizontal">
        {/* <Panel
          defaultSize={33}
          collapsible
          order={0}
          collapsedSize={0}
          slot="blah"
        >
          <div id="node-debug" className="p-2"></div>
        </Panel> */}
        {/* <PanelResizeHandle className="w-1 bg-dark" /> */}
        <Panel defaultSize={75} order={1}>
          <div className="relative w-full h-full bg-dark">
            <MouseFollower>
              <div id="mouse-node-debug"></div>
            </MouseFollower>
            <div className="absolute inset-0">
              <Canvas>
                <group>
                  {/* <Perf position="bottom-right"  /> */}
                  <TerrainRenderer radius={radius} />
                  {/* <CubeVisualizer scale={radius} /> */}
                </group>
              </Canvas>
            </div>
            <MapModeBar />
            <div className="z-[3] absolute right-0 top-0 h-full border-l border-dark">
              <ColorRamp />
            </div>
          </div>
          <Footer />
        </Panel>
        {/* <PanelResizeHandle className="w-1 bg-dark" />
        <Panel defaultSize={25} collapsible order={2}>
          <div id="node-debug" className="p-2"></div>
        </Panel> */}
      </PanelGroup>
    </div>
  );
};
