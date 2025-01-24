import { CubicQuadtree } from "@/lib/Quadtree/CubicQuadtree";
import { QuadtreeVisualizer } from "@/lib/Quadtree/Quadthree";
import { Button } from "@nextui-org/react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import { useMemo, useRef, useState } from "react";
import { Group, Sphere, Vector3 } from "three";

const origin = new Vector3();
const temp = new Vector3();
const radius = 2048;

export const Home: React.FC = () => {
  const [playing, setPlaying] = useState(true);
  const camera = useThree((state) => state.camera);
  const groupRef = useRef<Group>(null);
  const groupRefY = useRef<Group>(null);
  const groupRefZ = useRef<Group>(null);
  const [sphere] = useState(() => new Sphere(new Vector3(), radius));
  const [mouseTarget] = useState(new Vector3());

  const quadtreeThingy = useMemo(() => {
    return new CubicQuadtree({
      size: radius,
      minNodeSize: 10,
      origin: new Vector3(),
      comparatorValue: 1.5,
    });
  }, []);

  useFrame(() => {
    if (playing) {
      groupRef.current.rotateY(0.01);
      groupRef.current.rotateX(0.01);
      groupRefY.current.rotateX(0.025);
      groupRefZ.current.rotateY(-0.05);
      groupRefZ.current.rotateX(-0.05);
      const timeBefore = performance.now();
      quadtreeThingy.reset();
      groupRef.current.children.forEach((child) => {
        quadtreeThingy.insert(child.getWorldPosition(temp));
      });
      groupRefY.current.children.forEach((child) => {
        quadtreeThingy.insert(child.getWorldPosition(temp));
      });
      groupRefZ.current.children.forEach((child) => {
        quadtreeThingy.insert(child.getWorldPosition(temp));
      });
      quadtreeThingy.insert(
        groupRefZ.current.children[0].getWorldPosition(temp)
      );
      const timeAfter = performance.now();

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
    }

    window.quadTree = quadtreeThingy;
  });

  return (
    <group>
      <Perf position="bottom-right" />
      <group position={[0, radius + 1024, 0]}>
        <Html key="yes">
          <div id="debug" className="text-azure"></div>
          <div>
            <Button onPress={() => setPlaying(!playing)}>
              {playing ? "stop" : "play"}
            </Button>
          </div>
        </Html>
      </group>

      <group ref={groupRef}>
        <mesh position={new Vector3(0, 0, radius)} scale={[64, 64, 64]}>
          <sphereGeometry />
          <meshBasicMaterial color="green" />
        </mesh>
        <mesh position={new Vector3(0, radius, 0)} scale={[64, 64, 64]}>
          <sphereGeometry />
          <meshBasicMaterial color="blue" />
        </mesh>
        <mesh position={new Vector3(radius, 0, 0)} scale={[64, 64, 64]}>
          <sphereGeometry />
          <meshBasicMaterial color="red" />
        </mesh>

        <group ref={groupRefY}>
          <mesh position={new Vector3(0, 0, 2048)} scale={[32, 32, 32]}>
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
          </mesh>
        </group>
      </group>

      <group ref={groupRefZ}>
        <mesh position={new Vector3(0, 0, 2048)} scale={[32, 32, 32]}>
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
        </mesh>
      </group>

      {/* <mesh scale={new Vector3(2048, 2048, 2048)}>
        <sphereGeometry />
        <meshStandardMaterial color="pink" />
      </mesh> */}

      <QuadtreeVisualizer quadtree={quadtreeThingy} wireframe={false} />
    </group>
  );
};
