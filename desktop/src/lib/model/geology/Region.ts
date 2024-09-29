import { randomRange } from "@hello-worlds/core";
import { LatLong } from "@hello-worlds/planets";
import {
  cellToLatLng,
  cellToVertexes,
  cellsToDirectedEdge,
  directedEdgeToBoundary,
  getNumCells,
  gridDisk,
  isValidCell,
  latLngToCell,
  vertexToLatLng,
} from "h3-js";
import { Vector3 } from "three";
import { integerToRGB } from "../../images/Color";
import { SphericalPolygon } from "../../../../../lib/math/SphericalPolygon";
import { IPlate, IRegion, PlateType } from "./Geology.types";
import { REGION_AREA, RESOLUTION } from "./config";

const regionMap = new Map<string, Region>();
const tempLatLong = new LatLong();
const tempVec3 = new Vector3();

export class Region implements IRegion {
  public readonly polygon: SphericalPolygon;
  public plate: IPlate | undefined;
  public type?: PlateType;
  #centerCoordinate?: LatLong;
  #centerVec3?: Vector3;
  age: number = 0;
  elevation: number = 0;
  constructor(public readonly id: string) {
    if (!isValidCell(id)) {
      throw new Error("Invalid cell id, must sbe a valid h3 cell");
    }
    this.polygon = SphericalPolygon.fromH3Cell(id);
  }

  assignPlate(plate: IPlate) {
    this.plate = plate;
  }

  getVertices() {
    const vertexIds = cellToVertexes(this.id);
    const vertices = [];
    for (const vertexId of vertexIds) {
      const [lat, long] = vertexToLatLng(vertexId);
      vertices.push(new LatLong(lat, long));
    }
    return vertices;
  }

  getSharedVertices(region: IRegion) {
    const directedEdge = cellsToDirectedEdge(this.id, region.id);
    const boundary = directedEdgeToBoundary(directedEdge);
    return boundary.map(([lat, lon]) => new LatLong(lat, lon));
  }

  getArea() {
    return REGION_AREA;
  }

  getCenterCoordinates(latLong?: LatLong) {
    if (this.#centerCoordinate) {
      return this.#centerCoordinate;
    }
    const [lat, lon] = cellToLatLng(this.id);
    this.#centerCoordinate = this.#centerCoordinate = new LatLong(lat, lon);
    return latLong ? latLong.set(lat, lon) : this.#centerCoordinate.clone();
  }

  getCenterVector3(radius: number) {
    if (this.#centerVec3) {
      return this.#centerVec3;
    }
    const center = this.getCenterCoordinates()
      .toCartesian(radius, tempVec3)
      .clone();
    this.#centerVec3 = center;
    return center.clone();
  }

  getNeighborIds() {
    return gridDisk(this.id, 1);
  }

  getSharedEdgeId(region: IRegion): string {
    return cellsToDirectedEdge(this.id, region.id);
  }

  getNeighbors() {
    const neighbors = [];
    for (const neighborId of this.getNeighborIds()) {
      neighbors.push(Region.getRegion(neighborId));
    }
    return neighbors;
  }

  static getRegionIdFromLatLong(latLong: LatLong) {
    return latLngToCell(latLong.lat, latLong.lon, RESOLUTION);
  }

  static getNewRegionFromLatLong(latLong: LatLong) {
    return Region.getRegion(Region.getRegionIdFromLatLong(latLong));
  }

  static getRandomRegion() {
    const randomVector = tempVec3
      .set(randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1))
      .normalize();
    const latLong = tempLatLong.cartesianToLatLong(randomVector);
    return Region.getRegion(Region.getRegionIdFromLatLong(latLong));
  }

  static getMaxRegions() {
    return getNumCells(RESOLUTION);
  }

  static getRegion(id: string) {
    let region = regionMap.get(id);
    if (!region) {
      region = new Region(id);
      regionMap.set(id, region);
    }
    return region;
  }

  static copy(region: IRegion) {
    const r = Region.getRegion(region.id);
    r.type = region.type;
    r.plate = region.plate;
    r.elevation = region.elevation;
    return r;
  }

  static getRegionIdAsInt(regionId: string) {
    if (RESOLUTION !== 3) {
      throw new Error("Only resolution 3 is supported");
    }
    const newId = regionId.slice(0, 6);
    const asInt = parseInt(newId, 16);
    return asInt;
  }

  static regionIdAsColor(regionId: string) {
    return integerToRGB(Region.getRegionIdAsInt(regionId));
  }
}
