import { EARTH_AUTHALIC_RADIUS } from "@/constants";
import { Html } from "@react-three/drei";
import { Perf } from "r3f-perf";
import { useRef, useState } from "react";
import { Group, Vector3 } from "three";
import { TerrainRenderer } from "../components/TerrainRenderer";

const origin = new Vector3();
const temp = new Vector3();
// radius of earth in meters

export const Home: React.FC = () => {
  const [playing, setPlaying] = useState(false);
  const radius = EARTH_AUTHALIC_RADIUS;
  // const camera = useThree((state) => state.camera);
  const groupRef = useRef<Group>(null);
  const groupRefY = useRef<Group>(null);
  const groupRefZ = useRef<Group>(null);

  // const { quadtree } = useQuadtree();

  // useFrame(() => {
  //   if (playing) {
  //     groupRef.current.rotateY(0.01);
  //     groupRef.current.rotateX(0.01);
  //     groupRefY.current.rotateX(0.025);
  //     groupRefZ.current.ro tateY(-0.05);
  //     groupRefZ.current.rotateX(-0.05);
  //     // const timeBefore = performance.now();
  //     quadtree.reset();
  //     groupRef.current.children.forEach((child) => {
  //       child && quadtree.insert(child.getWorldPosition(temp));
  //     });
  //     groupRefY.current.children.forEach((child) => {
  //       child && quadtree.insert(child.getWorldPosition(temp));
  //     });
  //     groupRefZ.current.children.forEach((child) => {
  //       child && quadtree.insert(child.getWorldPosition(temp));
  //     });
  //     // quadtree.insert(
  //     //   groupRefZ.current.children[0].getWorldPosition(temp)
  //     // );
  //     // const timeAfter = performance.now();

  //     const trees = quadtree
  //       .getFaces()
  //       .map((face) => {
  //         return face.getTreeSummary();
  //       })
  //       .reduce((prevValue, currentValue) => {
  //         return (prevValue += currentValue.totalNodes);
  //       }, 0);
  //     document.getElementById("debug").innerText = `
  //     nodes: ${trees}
  //     distanceToCenter: ${camera.position.distanceTo(origin).toFixed(2)}
  //     `;
  //   }

  //   window.quadTree = quadtree;
  // });

  // useEffect(() => {
  //   const instancer = planet.terrainInstancer;

  //   // Test LOD updates
  //   let angle = 0;
  //   const animate = () => {
  //     angle += 0.01;
  //     camera.position.set(
  //       Math.sin(angle) * 10000000,
  //       Math.cos(angle) * 10000000,
  //       Math.cos(angle) * 10000000
  //     );
  //     instancer.update(camera);
  //     requestAnimationFrame(animate);
  //   };
  //   animate();
  // }, []);

  return (
    <group>
      <Perf position="bottom-right" />
      <group position={[0, radius + 1024, 0]}>
        <Html key="yes">
          <div id="debug" className="text-azure"></div>
          <div>
            {/* <Button onPress={() => setPlaying(!playing)}>
              {playing ? "stop" : "play"}
            </Button> */}
            {/* <H3TextureGenerator resolution={5} seedCount={40} /> */}
          </div>
        </Html>
      </group>

      <group ref={groupRef}>
        <mesh position={new Vector3(0, 0, radius)} scale={[64, 64, 64]}>
          <sphereGeometry />
          <meshBasicMaterial color="green" />
        </mesh>
        {/* <mesh position={new Vector3(0, radius, 0)} scale={[64, 64, 64]}>
          <sphereGeometry />
          <meshBasicMaterial color="blue" />
        </mesh>
        <mesh position={new Vector3(radius, 0, 0)} scale={[64, 64, 64]}>
          <sphereGeometry />
          <meshBasicMaterial color="red" />
        </mesh> */}

        <group ref={groupRefY}>
          {/* <mesh position={new Vector3(0, 0, 2048)} scale={[32, 32, 32]}>
            <sphereGeometry />
            <meshBasicMaterial color="green" />
          </mesh>
          <mesh position={new Vector3(0, 2048, 0)} scale={[32, 32, 32]}>
            <sphereGeometry />
            <meshBasicMaterial color="blue" />
          </mesh>
          <mesh position={new Vector3(radius, 0, 0)} scale={[32, 32, 32]}>
            <sphereGeometry />
            <meshBasicMaterial color="red" />
          </mesh> */}
        </group>
      </group>

      <group ref={groupRefZ}>
        {/* <mesh position={new Vector3(0, 0, 2048)} scale={[32, 32, 32]}>
          <sphereGeometry />
          <meshBasicMaterial color="green" />
        </mesh>
        <mesh position={new Vector3(0, 2048, 0)} scale={[32, 32, 32]}>
          <sphereGeometry />
          <meshBasicMaterial color="blue" />
        </mesh>
        <mesh position={new Vector3(radius, 0, 0)} scale={[32, 32, 32]}>
          <sphereGeometry />
          <meshBasicMaterial color="red" />
        </mesh> */}
      </group>

      {/* <mesh scale={new Vector3(2048, 2048, 2048)}>
        <sphereGeometry />
        <meshStandardMaterial color="pink" />
      </mesh> */}

      {/* <H3Geometry resolution={4} radius={radius} seedCount={40} /> */}

      <TerrainRenderer radius={radius} />
      <axesHelper args={[radius]} />
      {/* <CubeVisualizer scale={radius} /> */}
    </group>
  );
};
