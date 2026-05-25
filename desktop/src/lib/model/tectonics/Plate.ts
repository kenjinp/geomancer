import { MathUtils, Vector3 } from "three";

export class Plate {
  id: number;
  driftAxis = new Vector3().randomDirection();
  driftRate = MathUtils.randFloat(-Math.PI / 30, Math.PI / 30);
  // Normalized elevation values (positive is above sea level)
  landElevation: number = MathUtils.randFloat(0.000006, 0.03);
  oceanElevation: number = MathUtils.randFloat(-0.5, -0.1);
  growthBias: number = MathUtils.randFloat(0.000006, 0.03);
}
