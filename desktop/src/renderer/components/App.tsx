import { NextUIProvider } from "@nextui-org/react";
import { Panel, PanelGroup } from "react-resizable-panels";
import "../styles/app.css";
import { Home } from "../views/Home";
import { Canvas } from "./Canvas";
import { ColorRamp } from "./ColorRamp";

/**
 * Wrapper for the entire application.
 *
 * @component
 */
export function App() {
  return (
    <NextUIProvider>
      <div className="drag-region fixed w-full h-[32px] border-b border-dark bg-background"></div>
      <div className="relative top-[32px] h-screen w-screen flex bg-gradient-to-t from-[#1E201A] to-[#282A23]">
        <PanelGroup direction="horizontal">
          <Panel minSize={25} order={2}>
            <div className="relative w-full h-full bg-dark">
              <Canvas>
                <Home />
              </Canvas>
              <div className="absolute right-0 top-0 h-full border-l border-dark">
                <ColorRamp />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </NextUIProvider>
  );
}
