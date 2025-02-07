import { Button } from "@nextui-org/react";
import { useState } from "react";
import { CanvasTexture } from "three";

import { cellToChildren, getRes0Cells, latLngToCell } from "h3-js";

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
  size?: number;
}

export function H3TextureGenerator({
  resolution = 5,
  size = 1024,
}: H3TextureGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    try {
      // Generate the texture
      const texture = createH3Texture(resolution, size);

      // Get the canvas from the texture
      const canvas = texture.image;

      // Create a download link
      const link = document.createElement("a");
      link.download = `h3-texture-res${resolution}-${size}x${size}.png`;
      link.href = canvas.toDataURL("image/png");

      // Trigger download
      link.click();

      // Cleanup
      texture.dispose();
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
