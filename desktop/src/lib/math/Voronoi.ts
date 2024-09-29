import { createRandomSeed } from "@hello-worlds/core"
import { LatLong } from "@hello-worlds/planets"
import { booleanPointInPolygon, point, polygon } from "@turf/turf"
import * as d3 from "d3-geo-voronoi"
import { Line3, MathUtils, Vector3 } from "three"
import { distanceToGreatCircleLine } from "../../../lib/math/circle"
import { SphereGrid } from "../../../lib/sphere-grid/SphereGrid"

export interface VoronoiPolygon<T = any> {
  index: number
  geometry: {
    coordinates: [[number, number][]]
    // a list of lines here from start to end
    // test distance to each line
    type: "Polygon"
  }
  properties: {
    neighbours: number[]
    site: {
      coordinates: [number, number]
      type: "Point"
    }
    sitecoordinates: [number, number]
  }
  data: T
}

const tempLatLongA = new LatLong()
const tempLatLongB = new LatLong()
export const getDistanceToVoronoiPolygonEdge = (
  latLong: LatLong,
  polygon: VoronoiPolygon,
  radius: number,
) => {
  const polygonCoordinatesList = polygon.geometry.coordinates[0]
  let minDistance = Infinity
  for (let i = 0; i < polygonCoordinatesList.length - 1; i++) {
    const [lon1, lat1] = polygonCoordinatesList[i]
    const [lon2, lat2] = polygonCoordinatesList[i + 1]
    const distance = distanceToGreatCircleLine(
      latLong,
      tempLatLongA.set(lat1, lon1),
      tempLatLongB.set(lat2, lon2),
      radius,
    )
    minDistance = Math.min(distance, minDistance)
  }
  return minDistance
}

const tempLine3 = new Line3()
const tempVec3 = new Vector3()
const tempVec3B = new Vector3()
const tempVec3C = new Vector3()
export const getStraightLineDistanceToVoronoiPolygonEdge = (
  latLong: LatLong,
  polygon: VoronoiPolygon,
  radius: number,
) => {
  const polygonCoordinatesList = polygon.geometry.coordinates[0]
  let minDistance = Infinity
  for (let i = 0; i < polygonCoordinatesList.length - 1; i++) {
    const [lon1, lat1] = polygonCoordinatesList[i]
    const nextIndex = i + 1 === polygonCoordinatesList.length ? 0 : i + 1
    const [lon2, lat2] = polygonCoordinatesList[nextIndex]
    tempLatLongA.set(lat1, lon1),
      tempLatLongB.set(lat2, lon2),
      tempLine3.start.copy(tempLatLongA.toCartesian(radius, tempVec3))
    tempLine3.end.copy(tempLatLongB.toCartesian(radius, tempVec3))
    tempVec3B.copy(latLong.toCartesian(radius, tempVec3B))
    tempLine3.closestPointToPoint(tempVec3B, true, tempVec3C)
    const distance = tempVec3B.distanceTo(tempVec3C)
    minDistance = Math.min(distance, minDistance)
  }
  return minDistance
}

export class VoronoiSphere<T> {
  voronoiPolygons: VoronoiPolygon<T>[]
  constructor(
    numberOfPoints: number = 500,
    public sphereGrid: SphereGrid,
    seed?: string,
  ) {
    const r = createRandomSeed(seed || MathUtils.generateUUID())

    const points = {
      type: "FeatureCollection",
      features: new Array(numberOfPoints).fill(0).map(() => {
        const vector = new Vector3(
          r.next() * 2 - 1,
          r.next() * 2 - 1,
          r.next() * 2 - 1,
        ).normalize()
        const latLong = tempLatLongA.cartesianToLatLong(vector)

        return {
          type: "Point",
          coordinates: [latLong.lon, latLong.lat],
        }
      }),
    }

    const features = d3.geoVoronoi()(points).polygons()
      .features as VoronoiPolygon<T>[]

    features.map((feature, index) => {
      // get all the tiles which
      const polygonCoordinatesList = feature.geometry.coordinates[0]
      const p = polygonCoordinatesList.map(polygonCoordinate => {
        const [lon, lat] = polygonCoordinate
        const latLong = new LatLong(lat, lon)
        return latLong
      })
      feature.index = index
      feature.data = {}

      const polygonIntersectsNorthPole = booleanPointInPolygon(
        point([0, 88.99]),
        polygon(feature.geometry.coordinates),
      )
      const polygonIntersectsSouthPole = booleanPointInPolygon(
        point([0, -88.99]),
        polygon(feature.geometry.coordinates),
      )

      if (polygonIntersectsNorthPole) {
        console.log({ index, polygonIntersectsNorthPole })
        throw new Error("wtf N")
      }
      if (polygonIntersectsSouthPole) {
        console.log({ index, polygonIntersectsSouthPole })
        throw new Error("wtf S")
      }

      // this doesnt work if the polygon passes over a pole
      // therefore we should split the polygon into triangles
      // if (index === 351) {
      //   const polygons = []
      //   for (let i = 0; i < p.length - 1; i++) {
      //     let ll1 = p[i]
      //     const next = i + 1 === p.length ? 0 : i + 1
      //     let ll2 = p[next]
      //     const sign = Math.sign(ll1.lon)
      //     console.log("sign", sign)
      //     polygons.push([ll1.clone(), ll2.clone(), new LatLong(0, 89.999)])
      //   }
      //   console.log("nPole", index.toString(), { p, polygons })
      //   polygons.forEach(p => {
      //     sphereGrid.insertPolygon(index.toString(), p)
      //   })

      //   return feature
      // }
      // if (polygonIntersectsSouthPole) {
      //   const polygons = []
      //   for (let i = 0; i < p.length - 1; i++) {
      //     let ll1 = p[i]
      //     const next = i + 1 === p.length ? 0 : i + 1
      //     let ll2 = p[next]
      //     polygons.push([ll1.clone(), ll2.clone(), new LatLong(0, -89.999)])
      //   }
      //   console.log("sPole", index.toString(), { p, polygons })

      //   // polygons.forEach(p => {
      //   //   sphereGrid.insertPolygon(index.toString(), p)
      //   // })
      //   // return feature
      // }

      sphereGrid.insertPolygon(index.toString(), p)

      return feature
    })

    this.voronoiPolygons = features
  }
}
