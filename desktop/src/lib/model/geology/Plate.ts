import { randomRange } from "@hello-worlds/core";
import { LatLong } from "@hello-worlds/planets";
import { lineString, point, pointToLineDistance } from "@turf/turf";
import { Vector3 } from "three";
import { MapSet } from "../../../../lib/map-set/MapSet";
import { SphericalPolygon } from "../../../../../lib/math/SphericalPolygon";
import { IGeology, IPlate, IRegion, PlateType } from "./Geology.types";
import { Region } from "./Region";
import { REGION_AREA } from "./config";

export function randomUnitVector() {
  var theta = randomRange(0, Math.PI * 2);
  var phi = Math.acos(randomRange(-1, 1));
  var sinPhi = Math.sin(phi);
  return new Vector3(
    Math.cos(theta) * sinPhi,
    Math.sin(theta) * sinPhi,
    Math.cos(phi)
  );
}

const tempVec3 = new Vector3();
const tempLatLong = new LatLong();
export class Plate implements IPlate {
  readonly initialRegion: IRegion;
  private _regions: Map<string, IRegion> = new Map();
  driftAxis: Vector3;
  driftRate: number;
  spinRate: number;
  plateType: PlateType = PlateType.Hybrid;
  plateGrowthBiasBearing: number;
  shape: SphericalPolygon = new SphericalPolygon();
  continetalShape: SphericalPolygon = new SphericalPolygon();
  #neighbors = new Set<string>();
  borderRegionsIds = new Set<string>();
  neighboringPlates = new Set<IPlate>();
  neighboringRegions = new Set<IRegion>();
  boundaryVertices = new Set<LatLong[]>();
  neighboringBoundaryRegions = new MapSet<IPlate, IRegion>();
  growthBias: number;
  landElevation: number = randomRange(0.000006, 0.03);
  oceanElevation: number = randomRange(-0.5, -0.1);
  #geology: IGeology;
  constructor(
    public readonly id: number,
    initialRegion: IRegion,
    geology: IGeology
  ) {
    this.#geology = geology;
    this.initialRegion = initialRegion;
    this.driftRate = randomRange(-Math.PI / 30, Math.PI / 30);
    this.spinRate = randomRange(-Math.PI / 30, Math.PI / 30);
    this.driftAxis = randomUnitVector();
    this.growthBias = randomRange(0.6, 1.4);
    this.addRegion(initialRegion);
    this.plateGrowthBiasBearing = randomRange(0, 360);
  }

  get regions() {
    return Array.from(this._regions.values());
  }

  addRegion(region: IRegion) {
    region.assignPlate(this);
    this._regions.set(region.id, region);
    this.assignNeighborsFromRegion(region);
  }

  assignNeighborsFromRegion(region: IRegion) {
    for (const neighbor of region.getNeighbors()) {
      this.#neighbors.add(neighbor.id);
    }
    this.#neighbors.delete(region.id);
  }

  mergeRegionsIntoPolygon() {
    try {
      // this.shape = SphericalPolygon.fromH3Cells(
      //   Array.from(this._regions.keys()),
      // )
      // this tends not to work if the polygon is over the poles
      // so should find a better way
      this.continetalShape = SphericalPolygon.fromH3Cells(
        this.regions
          .filter((r) => r.type === PlateType.Continental)
          .map((r) => r.id)
      );
      console.log(this, this.continetalShape);
    } catch (error) {
      console.log("failed here", this);
      console.error(error);
    }
  }

  getArea() {
    return this._regions.size * REGION_AREA;
  }

  // getContinentalBorderingRegions() {
  //   const borderingRegions = new Set<IRegion>()
  //   for (const r of this._regions.values()) {
  //     const neighbors = r.getNeighbors()
  //     for (const neighbor of neighbors) {
  //       if (
  //         r.type === PlateType.Continental &&
  //         neighbor.type === PlateType.Oceanic
  //       ) {
  //         borderingRegions.add(r.id)
  //         continue
  //       }
  //     }
  //   }
  //   this.borderRegions = borderingRegions
  //   return Array.from(borderingRegions)
  // }

  getBorderingRegions() {
    const borderRegionsIds = new Set<string>();
    for (const r of this._regions.values()) {
      const neighbors = r.getNeighbors();
      for (const neighbor of neighbors) {
        if (neighbor.plate && neighbor.plate !== this) {
          // this plate is different than us
          borderRegionsIds.add(r.id);
          this.neighboringPlates.add(neighbor.plate);
          this.neighboringBoundaryRegions.add(neighbor.plate, neighbor);

          this.#geology.addBoundaryEdge(r, neighbor);
        }
        if (!neighbor.plate) {
          // this region has no plate
          console.warn("region has no plate", neighbor);
        }
      }
    }
    this.borderRegionsIds = borderRegionsIds;
    // const blah = Array.from(this.boundaryVertices)

    // this.shape.setFromVertices([...blah, blah[0]])
    return Array.from(borderRegionsIds);
  }

  getDistanceToBorder(position: LatLong) {
    const minDistances = Array.from(this.boundaryVertices).map((edge) => {
      const coordinates = edge.map((v) => [v.lon, v.lat]);
      const line = lineString(coordinates);
      return pointToLineDistance(point([position.lon, position.lat]), line, {
        units: "meters",
        // method: "geodesic",
      });
    });

    // Find the minimum distance from the array of distances
    const minDistance = Math.min(...minDistances);
    return minDistance;
  }

  getNeighboringRegions() {
    return Array.from(this.#neighbors.values()).map((id) =>
      Region.getRegion(id)
    );
  }

  getMovementFromPosition(position: Vector3, radius: number) {
    throw new Error("Method not implemented.");
  }

  calculateMovement(
    position: Vector3,
    radius: number,
    drifRateModifier: number = 1
  ) {
    const movement = this.driftAxis
      .clone()
      .cross(position)
      .setLength(
        this.driftRate *
          drifRateModifier *
          position.clone().projectOnVector(this.driftAxis).distanceTo(position)
      );
    const intialLatLong = this.initialRegion.getCenterCoordinates();
    const initialPosition = intialLatLong.toCartesian(radius, tempVec3);

    movement.add(
      initialPosition
        .clone()
        .cross(position)
        .setLength(
          this.spinRate *
            position
              .clone()
              .projectOnVector(initialPosition)
              .distanceTo(position)
        )
    );
    return movement;
  }

  static copy(plate: IPlate, geology: IGeology) {
    const initialRegion = Region.copy(plate.initialRegion);
    const newPlate = new Plate(plate.id, initialRegion, geology);
    newPlate.driftAxis = new Vector3().copy(plate.driftAxis);
    newPlate.driftRate = plate.driftRate;
    newPlate.spinRate = plate.spinRate;
    newPlate.plateType = plate.plateType;
    newPlate.plateGrowthBiasBearing = plate.plateGrowthBiasBearing;
    newPlate.shape = new SphericalPolygon().copy(plate.shape);
    newPlate.continetalShape = new SphericalPolygon().copy(
      plate.continetalShape
    );
    newPlate.landElevation = plate.landElevation;
    newPlate.oceanElevation = plate.oceanElevation;

    plate._regions.forEach((r) => {
      const region = Region.copy(r);
      newPlate.addRegion(region);
    });
    newPlate.borderRegionsIds = new Set<string>(plate.borderRegionsIds);

    // newPlate.borderRegions = new Set<IRegion>(
    //   Array.from(plate.borderRegions).map(r => Region.copy(r)),
    // )
    // console.log({
    //   oldBorderRegions: plate.borderRegions,
    //   borderRegions: newPlate.borderRegions,
    // })

    newPlate.neighboringPlates = new Set<IPlate>(plate.neighboringPlates);
    // newPlate.neighboringRegions = new Set<IRegion>(plate.neighboringRegions)
    newPlate.boundaryVertices = new Set<LatLong>(plate.boundaryVertices);

    return newPlate;
  }
}
