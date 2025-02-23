import * as h3 from "h3-js";
import { HexNeighborMapGenerator } from "../coordinate-systems/hex/maps/HexNeighborMapGenerator";
import { FloodFillConfig, HexGridFloodFill } from "./FloodFill";
import { HexTileBuffer } from "./HexTileBuffer";

type CrustConfig = {
  landPercentage: number;
  continentalProbability: number; // Probability a plate becomes continental
  minContinentalPlates?: number;
};

export class CrustAssignmentFloodFill extends HexGridFloodFill {
  private continentalPlates: Set<number> = new Set();
  private totalCells: number;
  private continentalCells = 0;
  private targetContinentalCells: number;

  constructor(config: FloodFillConfig, private crustConfig: CrustConfig) {
    super(config);
    this.totalCells = h3.getNumCells(config.resolution);
    this.targetContinentalCells = Math.floor(
      (this.totalCells * crustConfig.landPercentage) / 100
    );
  }

  public static async assignCrust(
    resolution: number,
    seedCount: number,
    crustConfig: CrustConfig
  ): Promise<HexTileBuffer> {
    const floodFill = await super.doFloodfill(resolution, seedCount);
    const crustAssigner = new CrustAssignmentFloodFill(
      floodFill.config,
      crustConfig
    );

    // First assign plate types
    await crustAssigner.assignInitialPlateTypes(floodFill.hexTileBuffer);

    // Then expand continental crust until we reach target
    await crustAssigner.expandContinentalCrust();

    return crustAssigner.hexTileBuffer;
  }

  private async assignInitialPlateTypes(tileBuffer: HexTileBuffer) {
    // Get unique plate indices
    const plateIndices = new Set<number>();
    for (const tile of tileBuffer) {
      plateIndices.add(tile.tectonicPlate);
    }

    // Randomly select continental plates
    const plates = Array.from(plateIndices);
    while (
      this.continentalPlates.size <
        (this.crustConfig.minContinentalPlates || 1) ||
      this.continentalPlates.size / plates.length <
        this.crustConfig.continentalProbability
    ) {
      const randomPlate = plates[Math.floor(Math.random() * plates.length)];
      this.continentalPlates.add(randomPlate);
    }
  }

  private async expandContinentalCrust() {
    // For each continental plate, perform secondary flood fill to expand continental crust
    for (const plateId of this.continentalPlates) {
      await this.expandPlateCrust(plateId);
      if (this.continentalCells >= this.targetContinentalCells) break;
    }
  }

  private async expandPlateCrust(plateId: number) {
    // Get initial seed cells for this plate
    const plateCells = this.hexTileBuffer.getCellsByPlate(plateId);
    const initialSeeds = this.selectExpansionSeeds(plateCells);

    // Custom flood fill parameters for continental expansion
    const expansionConfig = {
      resolution: this.config.resolution,
      maxCells: this.config.maxCells,
      maxFrontierSize: Math.ceil(plateCells.length * 0.2),
      maxSeeds: initialSeeds.length,
    };
    const expansionFill = new HexGridFloodFill(expansionConfig);
    const neighborMap = await HexNeighborMapGenerator.loadFromWebP(
      "textures/hex/neighbor-map.webp",
      4
    );
    await expansionFill.initializeFromNeighborMap(neighborMap, plateCells);

    // Run modified flood fill that respects plate boundaries
    const result = await expansionFill.fill(initialSeeds);

    console.log({ result });
  }

  private selectExpansionSeeds(plateCells: string[]): string[] {
    // Select random seeds within plate for continental expansion
    const seeds = [];
    const numSeeds = Math.ceil(plateCells.length * 0.01); // 1% of plate as seeds
    while (seeds.length < numSeeds) {
      const randomCell =
        plateCells[Math.floor(Math.random() * plateCells.length)];
      if (!seeds.includes(randomCell)) {
        seeds.push(randomCell);
      }
    }
    return seeds;
  }
}
