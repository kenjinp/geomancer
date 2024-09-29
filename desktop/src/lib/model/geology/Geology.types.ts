import { LatLong } from "@hello-worlds/planets";
import { Vector3 } from "three";
import { SphericalPolygon } from "../../../../../lib/math/SphericalPolygon";
import { Hotspot } from "./hotspots/Hotspot";
import { PlateBoundary } from "./plate-boundaries/PlateBoundary";

export enum GeologyEventType {
  Generate = "Generate",
  CreatePlates = "CreatePlates",
  CreateContinents = "CreateContinents",
  CreateOceans = "CreateOceans",
  CreateOceanicPlates = "CreateOceanicPlates",
  CreateHotspots = "CreateHotspots",
  FillUnassignedPlates = "FillUnassignedPlates",
  CalculateBoundaryStress = "CalculateBoundaryStress",
  CalculateRegionalElevation = "CalculateRegionalElevation",
}

export enum CollisionType {
  Dormant = "Dormant",
  Divergent = "Divergent",
  Convergent = "Convergent",
  Transform = "Transform",
}

export type GeologyEventCallback = (payload: {
  geology: IGeology;
  data: { eventType: GeologyEventType; percentDone?: number };
}) => void;

export interface GeologyParams {
  percentOcean: number;
  numberOfInitialPlates: number;
  radius: number;
  seed?: string;
  numHotspots: number;
}

export interface IGeology {
  id: string;
  plates: IPlate[];
  regions: IRegion[];
  continents: IContinent[];
  oceans: IOcean[];
  generated: boolean;
  params: GeologyParams;
  continentShapes: SphericalPolygon;
  hotspots: Hotspot[];
  plateBoundaries: Map<string, PlateBoundary>;
  addBoundaryEdge: (regionA: IRegion, regionB: IRegion) => void;
  hasRegion: (region: IRegion) => boolean;
  addPlate: (plate: IPlate) => void;
  addRegion: (region: IRegion) => void;
  getPlateFromVector: (position: Vector3) => IPlate | undefined;
  getRegionFromVector: (position: Vector3) => IRegion | undefined;
  generate: VoidFunction;
  getPlateFromLatLong: (latLong: LatLong) => IPlate | undefined;
  // getNormalizedElevationAtCoordinate: (latLon: LatLong) => number
  // getElevationAtCoordinate: (latLon: LatLong) => number
  getElevationAtVector: (position: Vector3) => number;
  copy: (geology: IGeology) => IGeology;
  clone: () => IGeology;
  addEventListener: (
    event: GeologyEventType,
    callback: GeologyEventCallback
  ) => void;
  removeEventListener: (
    event: GeologyEventType,
    callback: GeologyEventCallback
  ) => void;
}

export enum PlateType {
  Oceanic = "Oceanic",
  Continental = "Continental",
  Hybrid = "Hybrid",
}

export interface IRegion {
  id: string;
  polygon: SphericalPolygon;
  plate?: IPlate;
  type?: PlateType;
  elevation: number;
  getArea: () => number;
  assignPlate: (plate: IPlate) => void;
  getCenterCoordinates: (latLong?: LatLong) => LatLong;
  getNeighbors: () => IRegion[];
  getSharedVertices(region: IRegion): LatLong[];
  getSharedEdgeId(region: IRegion): string;
  getCenterVector3: (radius: number) => Vector3;
}

export interface IPlate {
  id: number;
  regions: IRegion[];
  driftAxis: Vector3;
  driftRate: number;
  spinRate: number;
  shape: SphericalPolygon;
  continetalShape: SphericalPolygon;
  plateType: PlateType;
  initialRegion: IRegion;
  plateGrowthBiasBearing: number;
  neighboringPlates: Set<IPlate>;
  boundaryVertices: Set<LatLong[]>;
  borderRegionsIds: Set<string>;
  growthBias: number;
  landElevation: number;
  oceanElevation: number;
  addRegion: (region: IRegion) => void;
  getArea: () => number;
  getNeighboringRegions: () => IRegion[];
  calculateMovement: (position: Vector3, radius: number) => Vector3;
}

export interface IContinent {
  id: string;
  regions: IRegion[];
}

export interface IOcean {
  id: string;
  regions: IRegion[];
}
