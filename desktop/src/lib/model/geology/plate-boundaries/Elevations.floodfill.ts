// from each plate boundary contiguous edge
// find each edge, and assign both neighboring regions
// propogate until all the regions of the plate are assigned
// or until the elevation contribution is 0

import { MapSet } from "../../../../../lib/map-set/MapSet"
import { Queue } from "../../../../../lib/queue/Queue"
import { CollisionType, IGeology, IRegion } from "../Geology.types"
import {
  calculateCollidingElevation,
  calculateDivergingElevation,
  calculateDormantElevation,
  calculateShearingElevation,
} from "./BoundaryElevations"
import { PlateBoundaryEdge } from "./PlateBoundary"

type QueueItem = { region: IRegion; edge: PlateBoundaryEdge }

export function* floodfillElevations(geology: IGeology) {
  yield 0.0

  let i = 0
  for (const [, pb] of geology.plateBoundaries) {
    for (const contiguousEdgeIdList of pb.sortedContiguousEdges) {
      let edgeFronts: Queue<QueueItem>[] = []
      const frontMapset = new MapSet<Queue<QueueItem>, string>()
      for (const contiguousEdgeId of contiguousEdgeIdList) {
        const contiguousEdge = pb.edges.get(contiguousEdgeId)!
        const front = new Queue<QueueItem>()
        edgeFronts.push(front)
        front.enqueue({
          region: contiguousEdge.regionA,
          edge: contiguousEdge,
        })
        front.enqueue({
          region: contiguousEdge.regionB,
          edge: contiguousEdge,
        })
      }

      const calculateElevationAccordingToForce = (
        region: IRegion,
        edge: PlateBoundaryEdge,
        force: {
          pressure: number
          shear: number
          collisionType: CollisionType
        },
        boundaryElevation: number,
      ) => {
        let elevation = region.elevation
        if (force.collisionType === CollisionType.Convergent) {
          // if (region.type === PlateType.Oceanic) {
          //   elevation = calculateSubductingElevation(
          //     edge.calculateDistanceToRegion(region),
          //     edge.calculateDistanceToPlateRoot(region),
          //     boundaryElevation,
          //     region.elevation,
          //     force.pressure / 100,
          //     force.shear,
          //   )
          // } else {
          //   elevation = calculateSuperductingElevation(
          //     edge.calculateDistanceToRegion(region),
          //     edge.calculateDistanceToPlateRoot(region),
          //     boundaryElevation,
          //     region.elevation,
          //     force.pressure / 100,
          //     force.shear,
          //   )
          // }

          elevation = calculateCollidingElevation(
            edge.calculateDistanceToRegion(region),
            edge.calculateDistanceToPlateRoot(region),
            boundaryElevation,
            region.elevation,
            force.pressure,
            force.shear,
          )
        }
        if (force.collisionType === CollisionType.Divergent) {
          elevation = calculateDivergingElevation(
            edge.calculateDistanceToRegion(region),
            edge.calculateDistanceToPlateRoot(region),
            boundaryElevation,
            region.elevation,
            force.pressure,
            force.shear,
          )
        }
        if (force.collisionType === CollisionType.Transform) {
          elevation = calculateShearingElevation(
            edge.calculateDistanceToRegion(region),
            edge.calculateDistanceToPlateRoot(region),
            boundaryElevation,
            region.elevation,
            force.pressure,
            force.shear,
          )
        }
        if (force.collisionType === CollisionType.Dormant) {
          elevation = calculateDormantElevation(
            edge.calculateDistanceToRegion(region),
            edge.calculateDistanceToPlateRoot(region),
            boundaryElevation,
            region.elevation,
            force.pressure,
            force.shear,
          )
        }
        return elevation
      }
      while (edgeFronts.reduce((memo, q) => memo || !q.isEmpty, false)) {
        for (const front of edgeFronts) {
          const item = front.dequeue()
          if (!item) {
            continue
          }
          const { region, edge } = item
          if (!region) {
            continue
          }
          let elevation = region.elevation
          const pressureAttenuation = 40
          const boundaryElevationA =
            Math.max(edge.regionA.elevation, edge.regionB.elevation) +
            edge.forceA.pressure / pressureAttenuation
          const boundaryElevationB =
            Math.max(edge.regionA.elevation, edge.regionB.elevation) +
            edge.forceB.pressure / pressureAttenuation
          const elevationA = calculateElevationAccordingToForce(
            region,
            edge,
            edge.forceA,
            boundaryElevationA,
          )
          const elevationB = calculateElevationAccordingToForce(
            region,
            edge,
            edge.forceB,
            boundaryElevationB,
          )
          const newElevation = Math.max(elevationA, elevationB)
          const elevationDiff = newElevation - elevation
          region.elevation = newElevation
          frontMapset.add(front, region.id)
          const prevRegionSet = frontMapset.get(front)
          if (Math.abs(elevationDiff) < 0.02) {
            continue
          }

          for (const n of region.getNeighbors()) {
            if (n.plate === region.plate && !prevRegionSet?.has(n.id)) {
              front.enqueue({
                region: n,
                edge,
              })
            }
          }
        }
      }
    }
    yield i / pb.sortedContiguousEdges.size
    i++
  }

  // for (let i = 0; i < geology.params.numberOfInitialPlates; i++) {
  //   const percentDone = i / geology.params.numberOfInitialPlates
  //   yield percentDone
  // }
}
