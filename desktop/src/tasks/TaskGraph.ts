import { ContinentalGrowth } from "@/lib/Hextree/ContinentalGrowth";
import { HexGridFloodFill } from "@/lib/Hextree/FloodFill";
import { HydraulicErosionSimulator } from "@/lib/Hextree/HydraulicErosionSimulator";
import { PlateCollisionDetector as GPUPlateCollisionDetector } from "@/lib/Hextree/PlateCollisionDetector";
import { TerrainElevationGenerator } from "@/lib/Hextree/TerrainElevationGenerator";
import { ThermalErosionSimulator } from "@/lib/Hextree/ThermalErosionSimulator";
import { Plate } from "@/lib/model/tectonics/Plate";
import { Context, getState, setState } from "@/state/Context";
import { Dag } from "@ts-dag/builder";

export const dag = new Dag<Context>();

dag.useContext(async () => {
  const ctx = getState();
  // const buffers = ctx.buffers;
  // await buffers.hexPositionMap.downloadBinary("position-map.bin");
  return ctx;
});

const loadBuffers = dag.task("loadBuffers", async (ctx) => {
  try {
    console.log("loading buffers");
    const { buffers } = ctx;
    console.log("loading cube map");
    await buffers.hexCubeMap.loadFromWebPFiles([
      "textures/hex/index-cube-map/face-0.webp",
      "textures/hex/index-cube-map/face-1.webp",
      "textures/hex/index-cube-map/face-2.webp",
      "textures/hex/index-cube-map/face-3.webp",
      "textures/hex/index-cube-map/face-4.webp",
      "textures/hex/index-cube-map/face-5.webp",
    ]);
    console.log("loading neighbor map");
    await buffers.hexNeighborMap.loadFromWebP("textures/hex/neighbor-map.webp");
    console.log("loading position map");
    await buffers.hexPositionMap.loadFromBinary(
      "textures/hex/position-map.bin"
    );
    console.log("buffers loaded ");
    setState({
      buffers: {
        ...buffers,
        hexCubeMap: buffers.hexCubeMap,
        hexNeighborMap: buffers.hexNeighborMap,
        hexPositionMap: buffers.hexPositionMap,
      },
    });
  } catch (error) {
    console.error("Error loading buffers", error);
  }

  return ctx;
});

const generatePlates = dag.task("generatePlates", async (ctx, meta) => {
  console.log("generating plates", ctx.tectonics.numPlates);
  const {
    tectonics: { numPlates },
  } = ctx;

  // Create the plates
  const plates = new Array(numPlates).fill(0).map((_, i) => {
    return new Plate(i + 1);
  });
  console.log("generated plates", plates);

  // Create a new context with the plates included
  const newContext = {
    ...ctx,
    tectonics: {
      ...ctx.tectonics,
      plates,
    },
  };

  // Update the state
  setState(newContext);

  // Return the ENTIRE updated context (not just plates)
  return newContext;
});

const generatePlateHexBuffers = dag.task(
  "generatePlateHexBuffers",
  async (ctx, meta) => {
    try {
      console.log("generating plate hex buffers");
      const hexTileBuffer = (
        await HexGridFloodFill.doFloodfill(
          4,
          ctx.buffers.hexTileBuffer,
          ctx.buffers.hexNeighborMap,
          generatePlates.output.tectonics.plates // Use plates from context, not from previous task output
        )
      ).hexTileBuffer;
      console.log("plate hex buffers generated");
      const newContext = { ...ctx, buffers: { ...ctx.buffers, hexTileBuffer } };
      setState(newContext);
      return newContext;
    } catch (error) {
      console.error("Error generating plate hex buffers", error);
    }
    return ctx;
  },
  [loadBuffers, generatePlates]
);

const generateContinentalData = dag.task(
  "generateContinentalData",
  async (ctx) => {
    return ctx;
    console.log("generating continental data");
    const growth = await ContinentalGrowth.create(
      generatePlates.output.tectonics.plates,
      ctx.buffers.hexTileBuffer,
      ctx.buffers.hexNeighborMap,
      ctx.buffers.hexPositionMap,
      ctx.tectonics.continentalSeedConfig
    );
    await growth.growContinents();
    growth.destroy();
    console.log("continental data generated");
  },
  [generatePlateHexBuffers, generatePlates]
);

const generatePlateCollisionBoundaries = dag.task(
  "generatePlateCollisionBoundaries",
  async (ctx) => {
    console.log("Generating plate collision boundaries");
    try {
      const plates = generatePlates.output.tectonics.plates;
      const { hexTileBuffer, hexNeighborMap, hexPositionMap } = ctx.buffers;

      // Check if we have plates to process
      if (!plates || plates.length === 0) {
        console.warn("No tectonic plates found - skipping collision detection");
        return ctx;
      }

      // Ensure we have the required buffers
      if (!hexTileBuffer || !hexNeighborMap || !hexPositionMap) {
        console.error("Missing required buffers for plate collision detection");
        return ctx;
      }

      try {
        const detector = await GPUPlateCollisionDetector.create(
          hexTileBuffer,
          hexNeighborMap,
          hexPositionMap,
          plates,
          {
            convergentThreshold: 0.03,
            divergentThreshold: -0.03,
            transformThreshold: 0.07,
            seed: ctx.random.seed || Math.random(),
          }
        );

        const { plateBoundaries } = await detector.detectCollisions();

        console.log("plateBoundaries", plateBoundaries);

        // Clean up resources
        detector.destroy();

        // Update context with collision boundaries
        const newContext = {
          ...ctx,
          tectonics: {
            ...ctx.tectonics,
            plateBoundaries,
          },
        };

        // Update the context in the state
        setState(newContext);
        return newContext;
      } catch (gpuError) {
        console.error(
          "WebGPU error during plate collision detection:",
          gpuError
        );
        console.warn(
          "Falling back to CPU-based collision detection or skipping..."
        );
        // In a production app, you might implement a CPU fallback here
        // For now, we'll just return the context unchanged
        return ctx;
      }
    } catch (error) {
      console.error("Error generating plate collision boundaries:", error);
      return ctx;
    }
  },
  [generatePlateHexBuffers, generatePlates]
);

const generateTerrainElevations = dag.task(
  "generateTerrainElevations",
  async (ctx) => {
    return ctx;
    try {
      const elevationGen = await TerrainElevationGenerator.create(
        ctx.buffers.hexTileBuffer,
        ctx.buffers.hexPositionMap,
        {
          octaves: 20,
          persistence: 0.707,
          scale: 0.07,
          warpStrength: 0.6,
          baseStrength: 0.4,
          seed: getState().random.seed,
        }
      );

      await elevationGen.generateElevations();
      elevationGen.destroy();
      console.log("terrain elevations generated");
    } catch (error) {
      console.error(error);
    }
  },
  [generatePlateHexBuffers, generatePlates]
);

const generateThermalErosion = dag.task(
  "generateThermalErosion",
  async (ctx) => {
    // skip
    return ctx;
    try {
      console.log("applying thermal erosion");

      // Get the necessary buffers for erosion
      const { hexTileBuffer, hexNeighborMap } = ctx.buffers;

      // Thermal erosion parameters
      const erosionParams = {
        iterations: 15, // Number of erosion passes
        talus: 0.4, // Critical slope threshold (tangent)
        erosionRate: 0.15, // Rate at which material moves downslope
        smoothingFactor: 0.3, // Amount of smoothing to apply
        seed: getState().random.seed,
      };

      // Create the erosion simulator with our parameters
      const erosion = await ThermalErosionSimulator.create(
        hexTileBuffer,
        new Uint32Array(hexNeighborMap.texture.image.data.buffer),
        erosionParams
      );

      // Apply the erosion
      await erosion.applyErosion();

      // Clean up
      erosion.destroy();

      console.log("thermal erosion applied with params:", erosionParams);

      // Return the context (potentially with updated buffers)
      return ctx;
    } catch (error) {
      console.error("Error during thermal erosion:", error);
      return ctx;
    }
  },
  [generateTerrainElevations]
);

const generateHydraulicErosion = dag.task(
  "generateHydraulicErosion",
  async (ctx) => {
    // skip
    return ctx;
    try {
      console.log("applying hydraulic erosion");

      // Get the necessary buffers for erosion
      const { hexTileBuffer, hexNeighborMap } = ctx.buffers;

      // Hydraulic erosion parameters
      const erosionParams = {
        iterations: 1, // Number of erosion passes
        rainAmount: 0.05, // Amount of rain per iteration
        evaporationRate: 0.2, // Rate of water evaporation
        sedimentCapacity: 0.3, // Max sediment water can carry (based on slope)
        solubility: 0.3, // Rate of sediment dissolution
        depositionRate: 0.8, // Rate at which sediment is deposited
        seed: getState().random.seed,
      };

      // Create the erosion simulator with our parameters
      const erosion = await HydraulicErosionSimulator.create(
        hexTileBuffer,
        new Uint32Array(hexNeighborMap.texture.image.data.buffer),
        erosionParams
      );

      // Apply the erosion
      await erosion.applyErosion();

      // Clean up
      erosion.destroy();

      console.log("hydraulic erosion applied with params:", erosionParams);

      // Return the context
      return ctx;
    } catch (error) {
      console.error("Error during hydraulic erosion:", error);
      return ctx;
    }
  },
  [generateThermalErosion]
);

//  When any input changes, we run the dag
// dat propogates from the input to the output

// we hash the inputs and passthrough if the inputs haven't changed
//
export const runTaskGraph = async () => {
  await dag.run();
};
