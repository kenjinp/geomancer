import { EARTH_AUTHALIC_RADIUS, H3_RESOLUTION } from "@/constants";
import { H3CubeMapGenerator } from "@/lib/data-buffers/H3CubeMapGenerator";
import { HexNeighborMapGenerator } from "@/lib/data-buffers/HexNeighborMapGenerator";
import { HexPositionMapGenerator } from "@/lib/data-buffers/HexPositionMapGenerator";
import { HexTileBuffer } from "@/lib/data-buffers/HexTileBuffer";
import { Plate } from "@/lib/model/tectonics/Plate";
import Rand from "rand-seed";
import { Vector3 } from "three";
import { createStore } from "zustand/vanilla";

export enum MapMode {
  REALISTIC,
  ELEVATION,
  PLATES,
  HEXGRID,
  CHUNKS,
}

export enum MapLayer {
  HEXGRID,
  LATLONG,
  REALISTIC_LIGHTING,
  CHUNKS,
  SPHERE_PROJECTION,
  INTERPOLATION,
  COASTALNESS,
  ATMOSPHERE,
  PLATE_BOUNDARIES,
}

export interface Context {
  mapMode: MapMode;
  mapLayers: MapLayer[];
  random: {
    seed: number;
    seededRandom: Rand;
  };
  buffers: {
    hexNeighborMap: HexNeighborMapGenerator;
    hexPositionMap: HexPositionMapGenerator;
    hexCubeMap: H3CubeMapGenerator;
    hexTileBuffer: HexTileBuffer;
  };
  tectonics: {
    numPlates: number;
    plates: Plate[];
    continentalSeedConfig: {
      platePercentage: number;
      seedPercentage: number;
      landPercentage: number;
      growthProbability: number;
    };
  };
  planetology: {
    radius: number;
  };
  transform: {
    offset: Vector3;
  };
}

export const initialContext: Context = {
  mapMode: MapMode.ELEVATION,
  mapLayers: [MapLayer.SPHERE_PROJECTION, MapLayer.INTERPOLATION],
  random: {
    seed: 123,
    seededRandom: new Rand("0"),
  },
  buffers: {
    hexNeighborMap: new HexNeighborMapGenerator(H3_RESOLUTION),
    hexPositionMap: new HexPositionMapGenerator(H3_RESOLUTION),
    hexCubeMap: new H3CubeMapGenerator(H3_RESOLUTION, 1024),
    hexTileBuffer: new HexTileBuffer(H3_RESOLUTION),
  },
  tectonics: {
    numPlates: 40,
    plates: [],
    continentalSeedConfig: {
      platePercentage: 0.5, // 30% of plates
      seedPercentage: 0.0001, // 1% of plate cells as seeds
      landPercentage: 0.3, // Target 30% land coverage
      growthProbability: 0.65, // 65% chance to spread
    },
  },
  planetology: {
    radius: EARTH_AUTHALIC_RADIUS,
  },
  transform: {
    offset: new Vector3(),
  },
};

const store = createStore<Context>((set) => {
  return initialContext;
});

export const { getState, setState, subscribe, getInitialState } = store;

export default store;
