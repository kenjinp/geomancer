import * as h3 from "h3-js";
import { HexGrid } from "../coordinate-systems/hex/HexGrid";
import { HexNeighborMapGenerator } from "../coordinate-systems/hex/maps/HexNeighborMapGenerator";
import { FloodFillConfig, HexGridFloodFill } from "./FloodFill";
import { HexTileBuffer } from "./HexTileBuffer";
import continentalExpansionShader from "./shaders/continental-expansion.wgsl";

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

  getShader() {
    return continentalExpansionShader;
  }

  public static async assignCrust(
    resolution: number,
    seedCount: number,
    crustConfig: CrustConfig
  ): Promise<HexTileBuffer> {
    const config = HexGridFloodFill.configFromResolutionDynamic(
      resolution,
      seedCount + 1
    );
    const crustAssigner = new CrustAssignmentFloodFill(config, crustConfig);

    // First assign plate types
    await crustAssigner.assignInitialPlateTypes(crustAssigner.hexTileBuffer);

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
    const getCellsByPlate = (plateId: number): string[] => {
      const cells: string[] = [];
      // Use HexGrid.allNodes to get all cells at this resolution
      const allCells = HexGrid.allNodes(this.config.resolution);
      for (const cell of allCells) {
        const index = HexGrid.getIndex(cell);
        if (
          index !== undefined &&
          this.hexTileBuffer.readTileData(index).tectonicPlate === plateId
        ) {
          cells.push(cell);
        }
      }
      return cells;
    };

    // Get initial seed cells for this plate
    const plateCells = getCellsByPlate(plateId);

    const initialSeeds = this.selectExpansionSeeds(plateCells);

    console.log("expand plate initialSeeds", initialSeeds);

    // Custom flood fill parameters for continental expansion
    const expansionConfig = {
      resolution: this.config.resolution,
      maxCells: this.config.maxCells,
      maxFrontierSize: Math.ceil(plateCells.length * 0.2),
      maxSeeds: initialSeeds.length,
    };
    const expansionFill = await HexGridFloodFill.create(expansionConfig);

    // Initialize the expansion fill's tile buffer with existing plate data
    for (const cell of HexGrid.allNodes(this.config.resolution)) {
      const index = HexGrid.getIndex(cell);
      if (index !== undefined) {
        const data = this.hexTileBuffer.readTileData(index);
        expansionFill.hexTileBuffer.updateTileData(index, {
          ...data,
          // Only mark cells in this plate as fillable
          tectonicPlate: data.tectonicPlate === plateId ? plateId : 255,
        });
      }
    }

    const neighborMap = await HexNeighborMapGenerator.loadFromWebP(
      "textures/hex/neighbor-map.webp",
      4
    );

    // Initialize with ALL cells at this resolution, not just plate cells
    const allCells = HexGrid.allNodes(this.config.resolution);
    await expansionFill.initializeFromNeighborMap(neighborMap, allCells);

    // Run modified flood fill that respects plate boundaries
    const resultBuffer = await expansionFill.fill(initialSeeds);

    // Update the crust type for cells that were filled
    for (const tile of resultBuffer) {
      const index = HexGrid.getIndex(tile.h3Index);
      if (index !== undefined) {
        const currentData = this.hexTileBuffer.readTileData(index);
        // Only update if the cell belongs to our plate
        if (currentData.tectonicPlate === plateId) {
          this.hexTileBuffer.updateTileData(index, {
            ...currentData,
            crustType: "continental",
          });
          this.continentalCells++;
        }
      }
    }
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
