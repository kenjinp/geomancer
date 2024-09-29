import { remap } from "@hello-worlds/planets";
import { AREA_EARTH } from "../../../../../lib/math/earth";
import { floodfillPlates } from "./Geology.floodfill";
import { GeologyEventType, IGeology, PlateType } from "./Geology.types";
import { Plate } from "./Plate";
import { Region } from "./Region";
import { Hotspot } from "./hotspots/Hotspot";
import { floodfillElevations } from "./plate-boundaries/Elevations.floodfill";

export function generate(
  geology: IGeology,
  callEvent: (event: GeologyEventType, data: { percentDone: number }) => void
) {
  console.time("Generate");
  const createPlatesIterator = createPlates(geology);
  const createContinentalCrustIterator = createContinentalCrust(geology);
  const createOceanicCrustIterator = createOceanicCrust(geology);
  const createOceanicPlatesIterator = createOceanicPlates(geology);
  const fillUnassignedPlatesIterator = fillUnassignedPlates(geology);
  const createTectonicBoundariesIterator = createTectonicBoundaries(geology);
  const calculateBoundaryStressIterator = calculateBoundaryStress(geology);
  const calculateRegionalElevationIterator =
    calculateRegionalElevation(geology);
  const createHotspotsIterator = createHotspots(geology);

  function doIterator(
    iterator: Generator<any, any, any>,
    event: GeologyEventType
  ) {
    let next;
    let iterations = 0;
    while (!next?.done) {
      next = iterator.next();
      callEvent(event, { percentDone: next.value as number });
      iterations++;
    }
  }

  doIterator(createPlatesIterator, GeologyEventType.CreatePlates);
  doIterator(createContinentalCrustIterator, GeologyEventType.CreateContinents);
  doIterator(createOceanicCrustIterator, GeologyEventType.CreateOceans);
  doIterator(createOceanicPlatesIterator, GeologyEventType.CreateOceanicPlates);
  doIterator(
    createTectonicBoundariesIterator,
    GeologyEventType.CreateOceanicPlates
  );
  doIterator(
    fillUnassignedPlatesIterator,
    GeologyEventType.FillUnassignedPlates
  );
  doIterator(
    calculateBoundaryStressIterator,
    GeologyEventType.CalculateBoundaryStress
  );
  doIterator(
    calculateRegionalElevationIterator,
    GeologyEventType.CalculateRegionalElevation
  );
  doIterator(createHotspotsIterator, GeologyEventType.CreateHotspots);

  console.timeEnd("Generate");
}

function* createPlates(geology: IGeology) {
  // number of plates
  yield 0.0;
  for (let i = 0; i < geology.params.numberOfInitialPlates; i++) {
    const percentDone = i / geology.params.numberOfInitialPlates;

    const initialRegion = Region.getRandomRegion();
    initialRegion.type = PlateType.Continental;
    const plate = new Plate(i, initialRegion, geology);
    geology.addRegion(initialRegion);
    geology.addPlate(plate);
    initialRegion.elevation = plate.landElevation;

    yield percentDone;
  }
}

function* createContinentalCrust(geology: IGeology) {
  // grow crust until we reach a certain percentage of land
  let currentAreaAsPercentageOfTarget;
  yield 0.0;
  const iterator = floodfillPlates(
    geology,
    {
      noiseValue: 3.4,
      maxCost: 1,
      distanceScoreBias: 2.0,
      bearingScoreBias: 0.5,
    },
    function quitCondition() {
      const areaLandTarget = (1 - geology.params.percentOcean) * AREA_EARTH;
      const areaLand = geology.plates.reduce(
        (acc, plate) => acc + plate.getArea(),
        0
      );
      currentAreaAsPercentageOfTarget = areaLand / areaLandTarget;
      return currentAreaAsPercentageOfTarget >= 1.0;
    },
    (region, plate) => {
      region.type = PlateType.Continental;
      region.elevation = plate.landElevation;
    }
  );

  let iterate = iterator.next();
  let tries = 0;
  while (!iterate.done) {
    yield currentAreaAsPercentageOfTarget;
    iterate = iterator.next();
    tries++;
  }
}

function* createOceanicCrust(geology: IGeology) {
  // grow ocean until we claim all the regions
  const maxRegions = Region.getMaxRegions();
  const regionsAtStart = geology.regions.length;
  const percentAtStart = regionsAtStart / maxRegions;
  let percent = remap(regionsAtStart, regionsAtStart, maxRegions, 0, 1);

  yield percent;
  const iterator = floodfillPlates(
    geology,
    {
      noiseValue: 2.0,
      maxCost: 2.0,
      distanceScoreBias: 1.0,
      bearingScoreBias: 0.5,
    },
    function quitConditionOceanCrust() {
      percent = remap(geology.regions.length, regionsAtStart, maxRegions, 0, 1);

      return false;
    },
    (region, plate) => {
      region.type = PlateType.Oceanic;
      region.elevation = plate.oceanElevation;
    }
  );

  let iterate = iterator.next();
  let tries = 0;
  while (!iterate.done) {
    yield percent;
    iterate = iterator.next();
    tries++;
  }
}

function* createOceanicPlates(geology: IGeology) {
  // number of plates

  yield 1.0;
  // for (let i = 0; i < geology.params.numberOfInitialPlates; i++) {
  //   const percentDone = i / geology.params.numberOfInitialPlates
  //   yield percentDone
  // }
}

function* fillUnassignedPlates(geology: IGeology) {
  yield 0;
  for (const plate of geology.plates) {
    const percentDone = plate.id / geology.plates.length;
    for (const region of plate.getNeighboringRegions()) {
      if (!region.plate) {
        plate.addRegion(region);
        region.assignPlate(plate);
      }
    }
    yield percentDone;
  }
}

function* createTectonicBoundaries(geology: IGeology) {
  yield 0;
  for (const plate of geology.plates) {
    const percentDone = plate.id / geology.plates.length;
    // @ts-ignore
    plate.getBorderingRegions();
    yield percentDone;
  }
}

function* calculateBoundaryStress(geology: IGeology) {
  yield 0;
  let i = 0;
  for (const boundary of geology.plateBoundaries.values()) {
    const percentDone = i / geology.plateBoundaries.size;
    boundary.calculateStress();
    boundary.calculateContiguousEdges();
    boundary.blurBoundaryStress();
    boundary.calculateBoundaryType();
    yield percentDone;
    i++;
  }
}

function* calculateRegionalElevation(geology: IGeology) {
  const iterator = floodfillElevations(geology);
  let iterate = iterator.next();
  while (!iterate.done) {
    iterate = iterator.next();
    yield iterate;
  }
}

function* createHotspots(geology: IGeology) {
  yield 0;
  for (let i = 0; i < geology.params.numHotspots; i++) {
    const percentDone = i + 1 / geology.params.numHotspots;
    const hotspot = Hotspot.random(geology);
    // hotspot.calculateChainEffect()
    geology.hotspots.push(hotspot);

    yield percentDone;
  }
}
