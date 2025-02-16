import { Button } from "@nextui-org/react";
import { useState } from "react";
import { CanvasTexture } from "three";

import { cellToChildren, getRes0Cells, latLngToCell } from "h3-js";
import { HexGridFloodFill } from "./FloodFill";

// Get all cells at specified resolution
function getAllCellsAtRes(res) {
  return res === 0
    ? getRes0Cells()
    : getRes0Cells().flatMap((base) => cellToChildren(base, res));
}

// Create H3 texture with proper API calls
function createH3Texture(resolution, size = 1024) {
  const cells = getAllCellsAtRes(resolution);
  const cellToIndex = new Map(cells.map((cell, i) => [cell, i + 1])); // Start at 1

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = size * 2;
  canvas.height = size;
  const imageData = ctx.createImageData(canvas.width, canvas.height);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size * 2; x++) {
      const lng = (x / size) * 360 - 180;
      const lat = 90 - (y / size) * 180;

      try {
        const cell = latLngToCell(lat, lng, resolution);
        const index = cellToIndex.get(cell) || 0;

        const idx = (y * size * 2 + x) * 4;
        imageData.data[idx] = (index >> 16) & 0xff; // R
        imageData.data[idx + 1] = (index >> 8) & 0xff; // G
        imageData.data[idx + 2] = index & 0xff; // B
        imageData.data[idx + 3] = 255; // A
      } catch (e) {
        console.error("Error generating H3 texture:", e);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return new CanvasTexture(canvas);
}

interface H3TextureGeneratorProps {
  resolution?: number;
  seedCount?: number;
}

export function H3TextureGenerator({
  resolution = 3,
  seedCount = 4,
}: H3TextureGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      // Create a configuration for H3 resolution "resolution" with up to 50 seeds
      // const config = HexGridFloodFill.configFromResolutionDynamic(
      //   resolution,
      //   seedCount + 1
      // );

      // const floodFill = await HexGridFloodFill.create(config);
      // const h3Cells: string[] = HexGridFloodFill.getAllH3Cells(resolution);
      // await floodFill.precomputeNeighbors(h3Cells);
      // await floodFill.exportNeighborTexture(h3Cells, {
      //   asImage: true,
      //   square: true,
      // });
      // console.log("done");

      // Create a configuration for H3 resolution "resolution" with up to 50 seeds
      const config = HexGridFloodFill.configFromResolutionDynamic(
        resolution,
        seedCount + 1
      );

      console.log("hex fill 1", config);
      const floodFill = await HexGridFloodFill.create(config);

      // Now get all H3 cells at the same resolution
      const h3Cells: string[] = HexGridFloodFill.getAllH3Cells(resolution);

      // TODO somehow prebake this, maybe as a texture
      console.log("hex fill 2 (all cells)", h3Cells);
      const timeStart = performance.now();
      await floodFill.precomputeNeighbors(h3Cells);
      const timeEnd = performance.now();
      console.log(`hex fill 3: precompute ${timeEnd - timeStart}ms`);

      // choose random cells
      const seedCells: string[] = [];
      const pickedIndices = new Set<number>();
      while (seedCells.length < seedCount) {
        const randomIndex = Math.floor(Math.random() * h3Cells.length);
        if (!pickedIndices.has(randomIndex)) {
          pickedIndices.add(randomIndex);
          seedCells.push(h3Cells[randomIndex]);
        }
      }

      console.log("hex fill 4 (seedCells)", seedCells);
      const timeStart2 = performance.now();
      await floodFill.fill(seedCells);

      const timeEnd2 = performance.now();
      console.log(`hex fill 5: fill ${timeEnd2 - timeStart2}ms`);

      await floodFill.exportFloodFillResultsAsSquareImage();
      floodFill.destroy();
      console.log("hex fill 6 destroy");
    } catch (error) {
      console.error("Error generating texture:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      <Button
        onPress={handleGenerate}
        disabled={isGenerating}
        className={`px-4 py-2 ${
          isGenerating ? "cursor-wait opacity-70" : "cursor-pointer opacity-100"
        }`}
      >
        {isGenerating ? "Generating..." : "Generate and Download H3 Texture"}
      </Button>
    </div>
  );
}
