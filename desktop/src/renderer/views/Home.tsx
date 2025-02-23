import { EARTH_AUTHALIC_RADIUS } from "@/constants";
import { TerrainRenderer } from "../components/TerrainRenderer";

export const Home: React.FC = () => {
  const radius = EARTH_AUTHALIC_RADIUS;

  return (
    <group>
      {/* <Perf position="bottom-right" /> */}
      <TerrainRenderer radius={radius} />
      {/* <CubeVisualizer scale={radius} /> */}
    </group>
  );
};
