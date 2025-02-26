import { HexGridFloodFill } from "@/lib/Hextree/FloodFill";
import { Plate } from "@/lib/model/tectonics/Plate";
import { Context, getState, setState } from "@/state/Context";
import { Dag } from "@ts-dag/builder";

export const dag = new Dag<Context>();

dag.useContext(getState);

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

const generatePlates = dag.task("generatePlates", async (ctx) => {
  console.log("generating plates");
  const {
    tectonics: { numPlates },
  } = ctx;
  const plates = new Array(numPlates).fill(0).map((_, i) => {
    return new Plate();
  });
  const newContext = { ...ctx, tectonics: { ...ctx.tectonics, plates } };
  setState(newContext);
  ctx = newContext;
  return ctx;
});

const generatePlateHexBuffers = dag.task(
  "generatePlateHexBuffers",
  async (ctx) => {
    try {
      console.log("generating plate hex buffers");
      const hexTileBuffer = (
        await HexGridFloodFill.doFloodfill(
          4,
          ctx.buffers.hexTileBuffer,
          ctx.tectonics.plates
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

//  When any input changes, we run the dag
// dat propogates from the input to the output

// we hash the inputs and passthrough if the inputs haven't changed
//
export const runTaskGraph = async () => {
  await dag.run();
};
