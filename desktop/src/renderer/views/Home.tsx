import { CubicQuadtree } from "@/lib/Quadtree/CubicQuadtree";
import { QuadtreeVisualizer } from "@/lib/Quadtree/Quadthree";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import { useMemo, useRef } from "react";
import { Group, Vector3 } from "three";

const origin = new Vector3();
const temp = new Vector3();

export const Home: React.FC = () => {
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<Group>();
  const groupRefY = useRef<Group>();
  const groupRefZ = useRef<Group>();

  const quadtreeThingy = useMemo(() => {
    return new CubicQuadtree({
      size: 2048,
      minNodeSize: 10,
      origin: new Vector3(),
      comparatorValue: 1.5,
    });
  }, []);

  useFrame(() => {
    groupRef.current.rotateY(0.01);
    groupRefY.current.rotateX(0.01);
    groupRefZ.current.rotateY(-0.05);
    groupRefZ.current.rotateX(-0.05);
    const timeBefore = performance.now();
    quadtreeThingy.reset();
    quadtreeThingy.insert(groupRef.current.children[0].getWorldPosition(temp));
    quadtreeThingy.insert(groupRefY.current.children[0].getWorldPosition(temp));
    quadtreeThingy.insert(groupRefZ.current.children[0].getWorldPosition(temp));
    const timeAfter = performance.now();
    window.quadTree = quadtreeThingy;
    const trees = quadtreeThingy
      .getFaces()
      .map((face) => {
        return face.getTreeSummary();
      })
      .reduce((prevValue, currentValue) => {
        return (prevValue += currentValue.totalNodes);
      }, 0);

    document.getElementById("debug").innerText = `
    time:${(timeAfter - timeBefore).toFixed(4)}
    nodes: ${trees}
    distanceToCenter: ${camera.position.distanceTo(origin).toFixed(2)}
    `;
  });

  return (
    <group>
      <Perf />
      <group position={[0, 2048 + 1024, 0]}>
        <Html>
          <div id="debug" className="text-azure"></div>
        </Html>
      </group>

      <group ref={groupRef}>
        <mesh position={new Vector3(2048, 0, 0)} scale={[32, 32, 32]}>
          <sphereGeometry />
          <meshBasicMaterial color="red" />
        </mesh>
      </group>

      <group ref={groupRefY}>
        <mesh position={new Vector3(0, 2048, 0)} scale={[32, 32, 32]}>
          <sphereGeometry />
          <meshBasicMaterial color="blue" />
        </mesh>
      </group>

      <group ref={groupRefZ}>
        <mesh position={new Vector3(0, 0, 2048)} scale={[32, 32, 32]}>
          <sphereGeometry />
          <meshBasicMaterial color="green" />
        </mesh>
      </group>

      {/* <mesh scale={new Vector3(2048, 2048, 2048)}>
        <sphereGeometry />
        <meshStandardMaterial color="pink" />
      </mesh> */}

      <QuadtreeVisualizer quadtree={quadtreeThingy} />
    </group>
  );
};
