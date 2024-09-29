import { LatLong, Noise } from "@hello-worlds/planets"
import { rhumbBearing } from "@turf/turf"
import { Vector3 } from "three"
import { Queue } from "../../../../lib/queue/Queue"
import { IGeology, IPlate, IRegion } from "./Geology.types"
import { Region } from "./Region"

const vecA = new Vector3()
const vecB = new Vector3()
const tempLatLonA = new LatLong()
const tempLatLongB = new LatLong()

function normalizeAngleDifference(angle1: number, angle2: number): number {
  let angleDifference = Math.abs(angle1 - angle2)
  // Normalize the angle difference to the range [-180, 180] degrees
  angleDifference = ((((angleDifference + 180) % 360) + 360) % 360) - 180

  // Calculate the normalized value between 0 and 1
  const normalizedValue = (angleDifference + 180) / 360

  return normalizedValue
}

type QueueItem = { region?: IRegion; plate: IPlate }
const max = Region.getMaxRegions()

// We'll originate our plates and assign initial values
export function* floodfillPlates(
  geology: IGeology,
  params: {
    noiseValue: number
    maxCost: number
    distanceScoreBias: number
    bearingScoreBias: number
  },
  quitCondition: () => boolean,
  adjustRegion: (region: IRegion, plate: IPlate) => void,
) {
  const costNoise = new Noise({
    height: params.noiseValue,
    scale: geology.params.radius / 2,
    octaves: 5,
  })

  const haveAllRegionsBeenAssigned = () => {
    // @ts-ignore
    return geology._regions.size === max
  }

  const assignRegionToPlate = (region: IRegion, plate: IPlate) => {
    adjustRegion(region, plate)
    plate.addRegion(region)
    region.assignPlate(plate)
    geology.addRegion(region)
  }

  const costFunction = (region: IRegion, plate: IPlate) => {
    const regionLatLong = region.getCenterCoordinates()
    const startingRegionLatLong = plate.initialRegion.getCenterCoordinates()
    const cart = region.getCenterVector3(geology.params.radius)
    const noise = costNoise.getFromVector(cart)
    const cartStart = plate.initialRegion.getCenterVector3(
      geology.params.radius,
    )

    // promote closeness vs distance
    // lower score is better
    const calculateDistanceScore = () => {
      const distance = cart.distanceTo(cartStart)
      const normalizedDistance = distance / geology.params.radius
      return normalizedDistance
    }

    // promote similarity of desired bearing
    // lower score is better
    const calculateBiasDirectionScore = () => {
      const desiredBearing = plate.plateGrowthBiasBearing

      const bearing = rhumbBearing(
        [regionLatLong.lon, regionLatLong.lat],
        [startingRegionLatLong.lon, startingRegionLatLong.lat],
      )
      const normalizedBearingDifference = normalizeAngleDifference(
        desiredBearing,
        bearing,
      )
      return normalizedBearingDifference
    }

    const distanceScore = calculateDistanceScore()
    const biasDirectionScore = calculateBiasDirectionScore()

    const cost =
      (distanceScore * params.distanceScoreBias +
        biasDirectionScore * params.bearingScoreBias) *
      (1 - Math.abs(noise)) *
      plate.growthBias
    return cost
  }

  const findNextRegionToAssign = (plate: IPlate) => {
    const regionCandidates = plate.getNeighboringRegions()

    let minCost = Number.MAX_VALUE
    let minCostRegion: IRegion | undefined = undefined
    for (const region of regionCandidates) {
      if (!geology.hasRegion(region)) {
        const cost = costFunction(region, plate)
        if (cost < params.maxCost) {
          minCost = Math.min(minCost, cost)
          if (cost <= minCost) {
            minCostRegion = region
          }
        }
      }
    }

    return minCostRegion
  }

  let fronts: Queue<QueueItem>[] = geology.plates.map(
    _ => new Queue<QueueItem>(),
  )

  geology.plates.forEach((plate, index) => {
    // we will prime the fronts with a random neighbor of the plates starting region
    fronts[index].enqueue({
      plate,
      region: findNextRegionToAssign(plate),
    })
  })
  let quitCond = quitCondition()

  // while the fronts still have enqueued Regions to process, we will continue
  while (fronts.reduce((memo, q) => memo || !q.isEmpty, false) && !quitCond) {
    // fronts = shuffle<typeof fronts>(fronts)
    for (const front of fronts) {
      const item = front.dequeue()

      if (!item) {
        continue
      }
      const { region, plate } = item
      if (!region) {
        continue
      }
      const isAssigned = geology.hasRegion(region)
      if (!isAssigned) {
        assignRegionToPlate(region, plate)
      }

      if (!haveAllRegionsBeenAssigned()) {
        front.enqueue({
          plate,
          region: findNextRegionToAssign(plate),
        })
      }
    }

    quitCond = quitCondition()
    yield
  }
}
