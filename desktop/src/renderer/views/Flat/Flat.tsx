import { Canvas } from "@/renderer/components/Canvas";
import { Footer } from "@/renderer/components/footer/Footer";
import { Panel, PanelGroup } from "react-resizable-panels";

export const Flat: React.FC = () => {
  return (
    <div className="relative top-[32px] h-screen w-screen flex bg-gradient-to-t from-[#1E201A] to-[#282A23]">
      <PanelGroup direction="horizontal">
        <Panel defaultSize={75} order={1}>
          <div className="relative w-full h-full bg-dark">
            <Canvas>
              <ambientLight intensity={Math.PI / 90} />
              <group>
                <mesh>
                  <boxGeometry />
                  <meshStandardMaterial color="red" />
                </mesh>
              </group>
            </Canvas>
          </div>
          <Footer />
        </Panel>
      </PanelGroup>
    </div>
  );
};
