import { HexNeighborMapGenerator } from "@/lib/data-buffers/HexNeighborMapGenerator";
import { HexTileBuffer } from "@/lib/data-buffers/HexTileBuffer";
import { ContinentalGrowth } from "@/lib/Hextree/ContinentalGrowth";
import { HexGridFloodFill } from "@/lib/Hextree/FloodFill";
import { Plate } from "./Plate";

export class Tectonics {
  plates: Map<number, Plate> = new Map();

  constructor(public hexTileBuffer: HexTileBuffer, public readonly numPlates) {}

  public async generateTectonicPlates() {
    for (let i = 0; i < this.numPlates; i++) {
      const plate = new Plate();
      this.plates.set(i, plate);
    }
    await HexGridFloodFill.doFloodfill(4, this);
    return this.hexTileBuffer;
  }

  public async generateContinentalData() {
    const neighborMap = await HexNeighborMapGenerator.loadFromWebP(
      "textures/hex/neighbor-map.webp",
      4
    );
    const growth = await ContinentalGrowth.create(this, neighborMap, {
      platePercentage: 0.5, // 30% of plates
      seedPercentage: 0.0001, // 1% of plate cells as seeds
      landPercentage: 0.3, // Target 30% land coverage
      growthProbability: 0.65, // 65% chance to spread
    });
    await growth.growContinents();
    growth.destroy();
  }
}
