import type { ThreeElements } from "@react-three/fiber";

declare module "@react-three/fiber" {
  interface ThreeElements {
    meshStandardNodeMaterial: ThreeElements["meshStandardMaterial"];
    pointsNodeMaterial: ThreeElements["pointsMaterial"];
  }
}
