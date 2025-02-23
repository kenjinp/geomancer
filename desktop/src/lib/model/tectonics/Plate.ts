import { MathUtils } from "three";

export class Plate {
  initialRegion: string;
  spinRate: number;
  driftAxis: number;
  // Normalized elevation values (positive is above sea level)
  landElevation: number = MathUtils.randFloat(0.000006, 0.03);
  oceanElevation: number = MathUtils.randFloat(-0.5, -0.1);
  growthBias: number = MathUtils.randFloat(0.000006, 0.03);
}
