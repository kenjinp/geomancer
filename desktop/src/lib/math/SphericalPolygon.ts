import { LatLong } from "@hello-worlds/planets"
import {
  getCoords,
  lineString,
  point,
  pointToLineDistance,
  polygon,
} from "@turf/turf"
import { CoordPair, cellToBoundary, cellsToMultiPolygon, gridDisk } from "h3-js"
import { union } from "polyclip-ts"
import { Vector3 } from "three"

const useGEOJSONFormat = true
const tempLatLong = new LatLong()
export class SphericalPolygon {
  shape: CoordPair[][][] = []

  constructor(shape?: CoordPair[][][]) {
    if (!shape) return
    this.shape = shape
  }

  set(shape: CoordPair[][][]) {
    this.shape = shape
    return this
  }

  union(polygons: SphericalPolygon[]) {
    const allShapes = [this.shape, ...polygons.map(p => p.shape)]
      .filter(p => !!p.length)
      .map(p => p[0])
    // .filter(p => p.length && p[0].length === 1)
    console.log({ allShapes })
    const merged = union(...allShapes).filter(p => {
      console.log({ p })
      return p.length === 1
    })
    console.log({ merged })
    if (!merged) {
      console.warn("merge not successful")
      return this
    }
    return this.set(merged)
  }

  static union(polygons: SphericalPolygon[]) {
    return new SphericalPolygon().union(polygons)
  }

  intersection() {}

  contains() {}

  distanceToEdge(p: LatLong) {
    return SphericalPolygon.distanceToPolygonEdge(p, this)
  }

  static distanceToPolygonEdge(p: LatLong, polygon: SphericalPolygon) {
    if (!polygon) {
      throw new Error("No polygon")
    }
    const polygonEdges = getCoords(polygon.shape)
    const minDistances = polygonEdges.map(edge => {
      const line = edge.length === 1 ? lineString(edge[0]) : lineString(edge)
      return pointToLineDistance(point([p.lon, p.lat]), line, {
        units: "meters",
        method: "geodesic",
      })
    })

    // Find the minimum distance from the array of distances
    const minDistance = Math.min(...minDistances)
    return minDistance
  }

  getLineString() {
    return lineString(this.shape[0][0])
  }

  distanceToEdgeVector3(p: Vector3) {
    return SphericalPolygon.distanceToPolygonEdgeVector3(p, this)
  }

  static distanceToPolygonEdgeVector3(p: Vector3, polygon: SphericalPolygon) {
    const ll = tempLatLong.cartesianToLatLong(p)
    return this.distanceToPolygonEdge(ll, polygon)
  }

  copy(sphericalPolygon: SphericalPolygon) {
    this.shape = sphericalPolygon.shape
    return this
  }

  clone() {
    return new SphericalPolygon(this.shape)
  }

  setFromVertices(vertices: LatLong[]) {
    const p = vertices.map(v => [v.lon, v.lat])
    console.log(p)
    this.shape = polygon([p])
    return this
  }

  static fromH3Cell(cell: string) {
    const multiPolygon = cellsToMultiPolygon([cell], useGEOJSONFormat)
    if (!multiPolygon) throw new Error("No multipolygon found")
    return new SphericalPolygon().set(multiPolygon)
  }

  static fromH3Cells(cells: string[]) {
    const multiPolygon = h3CellsToGeoJSONPolygon(cells) //cellsToMultiPolygon(cells, useGEOJSONFormat)
    if (!multiPolygon) throw new Error("No multipolygon found")
    return new SphericalPolygon().set(multiPolygon)
  }
}

function h3CellsToGeoJSONPolygon(h3Cells: string[]) {
  if (!h3Cells || h3Cells.length === 0) {
    throw new Error("Input list of H3 cells is empty.")
  }

  const outerRingCoords: CoordPair[] = []

  for (const cell of h3Cells) {
    const neighbors = gridDisk(cell, 1) // Get the immediate neighbors of the cell

    let isOuterCell = false

    for (const neighbor of neighbors) {
      if (h3Cells.indexOf(neighbor) === -1) {
        // If any neighbor is not in the input list, it's an outer boundary cell
        isOuterCell = true
        break
      }
    }

    if (isOuterCell) {
      // If it's an outer boundary cell, add its coordinates to the result
      const vertices: CoordPair[] = cellToBoundary(cell, true)
      outerRingCoords.push(...vertices)
    }
  }

  const coordinates: CoordPair[] = outerRingCoords

  // Close the polygon by repeating the first vertex as the last vertex.
  if (coordinates.length > 0) {
    coordinates.push([...coordinates[0]])
  }

  // @ts-ignore
  return coordinates
}
