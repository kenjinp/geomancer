import { NextUIProvider, Button, Input, Divider } from "@nextui-org/react";
import "../styles/app.css";
import { ColorRamp } from "./ColorRamp";
import {
  getPanelElement,
  getPanelGroupElement,
  getResizeHandleElement,
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { useState } from "react";
import { Canvas } from "./BackgroundCanvas";
import { Scene } from "./Scene";
/**
 * Wrapper for the entire application.
 *
 * @component
 */
export function App() {
  const [renderSideBar, setRenderSideBar] = useState(true);
  return (
    <NextUIProvider>
      <div className="drag-region fixed w-full h-[32px] bg-background border-b border-dark"></div>
      <div className="relative top-[32px] h-screen w-screen flex bg-gradient-to-t from-[#1E201A] to-[#282A23]">
        <PanelGroup direction="horizontal">
          {renderSideBar && (
            <>
              <Panel
                id="sidebar"
                minSize={1}
                defaultSize={10}
                maxSize={50}
                order={1}
              >
                <div className="p-10 border-r border-dark">
                  <div className="mb-2">
                    <h1>
                      Geomancer <span className="text-primary">()</span>
                    </h1>
                    <img className="h-20" src="icons/icon.png" alt="Logo" />
                  </div>
                  <Divider className="mb-4" />
                  <div className="flex gap-2">
                    <Input placeholder="seed..."></Input>
                    <Button variant="bordered">Generate</Button>
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle />
            </>
          )}
          <Panel minSize={25} order={2}>
            <div className="relative w-full h-full bg-dark">
              <Canvas />
              <div className="absolute right-0 top-0 h-full border-l border-dark">
                <ColorRamp />
              </div>
              <div className="absolute bottom-2 p-10 w-full flex flex-end">
                <Button variant="bordered">Something</Button>
              </div>
            </div>
          </Panel>
        </PanelGroup>
        {/* <div className="p-10 border-r border-dark min-w-[300px]">
          <div className="mb-2">
            <h1>
              Geomancer <span className="text-primary">()</span>
            </h1>
          </div>
          <Divider className="mb-4" />
          <div className="flex gap-2">
            <Input placeholder="seed..."></Input>
            <Button variant="bordered">Generate</Button>
          </div>
        </div>
        <div className="relative w-full h-full bg-dark">
          <canvas id="canvas" className="w-full h-full"></canvas>
          <div className="absolute right-0 top-0 h-full border-l border-dark">
            <ColorRamp />
          </div>
          <div className="absolute bottom-2 p-10 w-full flex flex-end">
            <Button variant="bordered">Something</Button>
          </div>
        </div> */}
      </div>
    </NextUIProvider>
  );
}
