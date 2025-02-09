import { NextUIProvider } from "@nextui-org/react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import "../styles/app.css";
import { Home } from "../views/Home";
import { Canvas } from "./Canvas";
import { ColorRamp } from "./ColorRamp";
import { MouseFollower } from "./MouseFollower";

/**
 * Wrapper for the entire application.
 *
 * @component
 */
export function App() {
  // const qt = useMemo(() => {
  //   return new CubicQuadtree({
  //     size: radius,
  //     minNodeSize: 10,
  //     origin: new Vector3(),
  //     comparatorValue: 1.5,
  //   });
  // }, []);

  return (
    <NextUIProvider>
      {/* <QuadtreeProvider initialQuadtree={qt}> */}
      <div className="drag-region fixed w-full h-[32px] border-b border-dark bg-background"></div>
      <div className="relative top-[32px] h-screen w-screen flex bg-gradient-to-t from-[#1E201A] to-[#282A23]">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={67} order={1}>
            <div className="relative w-full h-full bg-dark">
              <MouseFollower>
                <div id="mouse-node-debug"></div>
              </MouseFollower>
              <Canvas>
                <Home />
              </Canvas>
              <div className="z-[3] absolute right-0 top-0 h-full border-l border-dark">
                <ColorRamp />
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-dark" />
          <Panel defaultSize={33} collapsible order={2}>
            <div id="node-debug" className="p-2"></div>
          </Panel>
        </PanelGroup>
      </div>
      {/* </QuadtreeProvider> */}
    </NextUIProvider>
  );
}
