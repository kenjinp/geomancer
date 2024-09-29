import { LatLong } from "@hello-worlds/planets"
import { length, lineString } from "@turf/turf"
import { Vector3 } from "three"
import { MapSet, findAllInSet } from "../../../../../lib/map-set/MapSet"
import { CollisionType, IGeology, IPlate, IRegion } from "../Geology.types"

// An edge between to plates!
export class PlateBoundaryEdge {
  id: string
  next?: string
  prev?: string
  cartA: Vector3 = new Vector3()
  cartB: Vector3 = new Vector3()
  forceA: { pressure: number; shear: number; collisionType: CollisionType } = {
    pressure: 0,
    shear: 0,
    collisionType: CollisionType.Dormant,
  }
  forceB: { pressure: number; shear: number; collisionType: CollisionType } = {
    pressure: 0,
    shear: 0,
    collisionType: CollisionType.Dormant,
  }
  vector: Vector3
  normal: Vector3
  relativeMovement?: Vector3
  #geology: IGeology
  elevation: number = 0
  constructor(
    public latLongA: LatLong,
    public latLongB: LatLong,
    public regionA: IRegion,
    public regionB: IRegion,
    geology: IGeology,
  ) {
    this.id = PlateBoundaryEdge.makeKey(latLongA, latLongB)
    const radius = geology.params.radius
    this.cartA = latLongA.toCartesian(radius, this.cartA)
    this.cartB = latLongB.toCartesian(radius, this.cartB)
    this.vector = this.cartA.clone().sub(this.cartB).normalize()
    this.normal = this.cartA.clone().cross(this.cartB).normalize()
    this.#geology = geology
  }

  static makeKey(latLongA: LatLong, latLongB: LatLong) {
    return [
      latLongA.lon.toFixed(5),
      latLongA.lat.toFixed(5),
      ":",
      latLongB.lon.toFixed(5),
      latLongB.lat.toFixed(5),
    ]
      .sort()
      .join("|")
  }

  getLength() {
    const line = lineString([
      [this.latLongA.lon, this.latLongA.lat],
      [this.latLongB.lon, this.latLongB.lat],
    ])
    return length(line, { units: "meters" })
  }
  get length() {
    return this.getLength()
  }

  calculateStress() {
    this.forceA = this.calculateStressAtPoint(this.cartA)
    this.forceB = this.calculateStressAtPoint(this.cartB)
  }

  calculateBoundaryType() {
    this.calculateBoundaryTypeForForce(this.forceA)
    this.calculateBoundaryTypeForForce(this.forceB)
  }

  calculateBoundaryTypeForForce(force: {
    pressure: number
    shear: number
    collisionType?: CollisionType
  }) {
    const pressure = force.pressure
    const shear = force.shear
    let collisionType = CollisionType.Dormant
    const BOUNDARY_PRESSURE_CONSTANT = 0.25

    if (pressure > BOUNDARY_PRESSURE_CONSTANT) {
      collisionType = CollisionType.Convergent
    } else if (pressure < -BOUNDARY_PRESSURE_CONSTANT) {
      collisionType = CollisionType.Divergent
    } else if (shear > BOUNDARY_PRESSURE_CONSTANT) {
      collisionType = CollisionType.Transform
    }

    force.collisionType = collisionType
  }

  calculateDistanceToRegion(region: IRegion) {
    const center = region.getCenterVector3(this.#geology.params.radius)
    const distanceA = center.distanceTo(this.cartA)
    const distanceB = center.distanceTo(this.cartB)
    return Math.min(distanceA, distanceB)
  }

  calculateDistanceToPlateRoot(region: IRegion) {
    const center = region.plate!.initialRegion.getCenterVector3(
      this.#geology.params.radius,
    )
    const distanceA = center.distanceTo(this.cartA)
    const distanceB = center.distanceTo(this.cartB)
    return Math.min(distanceA, distanceB)
  }

  calculateStressAtPoint(point: Vector3) {
    if (!this.regionA.plate || !this.regionB.plate) {
      throw new Error("Region does not have a plate")
    }

    const movementA = this.regionA.plate.calculateMovement(
      point.clone(),
      this.#geology.params.radius,
    )
    const movementB = this.regionB.plate.calculateMovement(
      point.clone(),
      this.#geology.params.radius,
    )
    const relativeMovement = movementA.clone().sub(movementB)
    this.relativeMovement = relativeMovement

    const pressureVector = relativeMovement.clone().projectOnVector(this.normal)
    let pressure = pressureVector.length()
    if (pressureVector.dot(this.normal) > 0) {
      pressure = -pressure
    }
    let shear = relativeMovement.clone().projectOnVector(this.vector).length()
    const normalize = this.#geology.params.radius / 50
    pressure = 2 / (1 + Math.exp(-pressure / normalize)) - 1
    shear = 2 / (1 + Math.exp(-shear / normalize)) - 1

    let collisionType = CollisionType.Dormant
    const BOUNDARY_PRESSURE_CONSTANT = 0.25

    if (pressure > BOUNDARY_PRESSURE_CONSTANT) {
      collisionType = CollisionType.Convergent
    } else if (pressure < -BOUNDARY_PRESSURE_CONSTANT) {
      collisionType = CollisionType.Divergent
    } else if (shear > BOUNDARY_PRESSURE_CONSTANT) {
      collisionType = CollisionType.Transform
    }

    return {
      collisionType,
      pressure,
      shear,
    }
  }
}

export class PlateBoundary {
  regions = new MapSet<number, IRegion>()
  plates = new Set<IPlate>()
  edges = new Map<string, PlateBoundaryEdge>()
  sortedContiguousEdges = new Set<string[]>()
  danglers: string[] = []
  constructor() {}

  addRegion(region: IRegion, plate: IPlate) {
    this.regions.add(plate.id, region)
    this.plates.add(plate)
  }
  addEdge(regionA: IRegion, regionB: IRegion, geology: IGeology) {
    const edge = regionA.getSharedVertices(regionB)
    const key = PlateBoundaryEdge.makeKey(edge[0], edge[1])
    if (this.edges.has(key)) {
      return
    }
    const edgeInstance = new PlateBoundaryEdge(
      edge[0],
      edge[1],
      regionA,
      regionB,
      geology,
    )
    if (!regionA.plate || !regionB.plate) {
      console.warn(regionA.plate, regionB.plate)
      throw new Error("Region does not have a plate")
    }
    this.addRegion(regionA, regionA.plate)
    this.addRegion(regionB, regionB.plate)
    this.edges.set(key, edgeInstance)
  }

  calculateStress() {
    for (const [, edge] of this.edges) {
      edge.calculateStress()
    }
  }

  calculateBoundaryType() {
    for (const [, edge] of this.edges) {
      edge.calculateBoundaryType()
    }
  }

  blurBoundaryStress() {
    for (const contiguousEdge of this.sortedContiguousEdges) {
      const newCornerPressure = new Array(contiguousEdge.length)
      const newCornerShear = new Array(contiguousEdge.length)
      const stressBlurIterations = 10
      const stressBlurCenterWeighting = 0.4

      for (var i = 0; i < stressBlurIterations; ++i) {
        for (var j = 0; j < newCornerPressure.length; ++j) {
          var edgeId = contiguousEdge[j]
          const edge = this.edges.get(edgeId)!
          var averagePressure = 0
          var averageShear = 0
          var neighborCount = 0

          if (edge.prev) {
            const prev = this.edges.get(edge.prev)!
            averagePressure += prev.forceB.pressure
            averageShear += prev.forceB.shear
            ++neighborCount
          }

          averagePressure += edge.forceA.pressure
          averageShear += edge.forceA.shear
          ++neighborCount

          averagePressure += edge.forceB.pressure
          averageShear += edge.forceB.shear
          ++neighborCount

          if (edge.next) {
            const next = this.edges.get(edge.next)!
            averagePressure += next.forceA.pressure
            averageShear += next.forceA.shear
            ++neighborCount
          }

          edge.forceA.pressure =
            edge.forceA.pressure * stressBlurCenterWeighting +
            (averagePressure / neighborCount) * (1 - stressBlurCenterWeighting)
          edge.forceA.shear =
            edge.forceA.shear * stressBlurCenterWeighting +
            (averageShear / neighborCount) * (1 - stressBlurCenterWeighting)
        }
      }
    }
  }

  clone() {
    const newBoundary = new PlateBoundary()
    newBoundary.regions = new MapSet(this.regions)
    newBoundary.plates = new Set(this.plates)
    newBoundary.edges = new Map(this.edges)
    return newBoundary
  }

  calculateContiguousEdges() {
    this.sortedContiguousEdges.clear()

    const createSortedContiguousEdge = (
      remainingEdges: Set<PlateBoundaryEdge>,
    ) => {
      let startingEdge: PlateBoundaryEdge = remainingEdges.values().next().value
      remainingEdges.delete(startingEdge)
      const sortedEdges = [startingEdge.id]

      if (!remainingEdges.size) {
        return sortedEdges
      }

      let currentEdge = startingEdge

      while (remainingEdges.size > 0) {
        const currentStart = currentEdge.latLongA
        const currentEnd = currentEdge.latLongB
        const nextEdges = findAllInSet(remainingEdges, edge => {
          // if b latlong matches current a latlong
          const matchStart = edge.latLongA
          return (
            (matchStart.lat.toFixed(4) === currentEnd.lat.toFixed(4) &&
              matchStart.lon.toFixed(4) === currentEnd.lon.toFixed(4)) ||
            // or if b latlong matches current b latlong
            (matchStart.lat.toFixed(4) === currentStart.lat.toFixed(4) &&
              matchStart.lon.toFixed(4) === currentStart.lon.toFixed(4))
          )
        })
        if (nextEdges.length > 0) {
          nextEdges.sort((a, b) => {
            const aLength = a.getLength()
            const bLength = b.getLength()
            return aLength + bLength
          })
          const nextEdge = nextEdges[0]
          sortedEdges.push(nextEdge.id)
          remainingEdges.delete(nextEdge)
          currentEdge.next = nextEdge.id
          nextEdge.prev = currentEdge.id
          currentEdge = nextEdge
        } else {
          break
        }
      }
      currentEdge = startingEdge
      while (remainingEdges.size > 0) {
        const currentStart = currentEdge.latLongA
        const currentEnd = currentEdge.latLongB
        const nextEdges = findAllInSet(remainingEdges, edge => {
          // if b latlong matches current a latlong
          const matchEnd = edge.latLongB
          return (
            (matchEnd.lat.toFixed(4) === currentEnd.lat.toFixed(4) &&
              matchEnd.lon.toFixed(4) === currentEnd.lon.toFixed(4)) ||
            // or if b latlong matches current b latlong
            (matchEnd.lat.toFixed(4) === currentStart.lat.toFixed(4) &&
              matchEnd.lon.toFixed(4) === currentStart.lon.toFixed(4))
          )
        })
        if (nextEdges.length > 0) {
          nextEdges.sort((a, b) => {
            const aLength = a.getLength()
            const bLength = b.getLength()
            return aLength - bLength
          })
          const nextEdge = nextEdges[0]
          sortedEdges.unshift(nextEdge.id)
          remainingEdges.delete(nextEdge)
          currentEdge.prev = nextEdge.id
          nextEdge.next = currentEdge.id
          currentEdge = nextEdge
        } else {
          break
        }
      }
      return sortedEdges
    }

    const remainingEdges = new Set(this.edges.values())
    const danglers: string[] = []
    while (remainingEdges.size > 0) {
      const sortedEdges = createSortedContiguousEdge(remainingEdges)
      if (sortedEdges.length > 1) {
        this.sortedContiguousEdges.add(sortedEdges)
      } else {
        danglers.push(sortedEdges[0])
      }
    }

    while (danglers.length) {
      const dangler = danglers.shift()
      let found = false
      if (!dangler) {
        break
      }

      const danglerEdge = this.edges.get(dangler)!

      for (const edges of this.sortedContiguousEdges) {
        // check front
        const front = edges[0]
        const frontEdge = this.edges.get(front)!
        if (
          (danglerEdge.latLongB.lon.toFixed(4) ===
            frontEdge.latLongA.lon.toFixed(4) &&
            danglerEdge.latLongB.lat.toFixed(4) ===
              frontEdge.latLongA.lat.toFixed(4)) ||
          (danglerEdge.latLongA.lon.toFixed(4) ===
            frontEdge.latLongA.lon.toFixed(4) &&
            danglerEdge.latLongA.lat.toFixed(4) ===
              frontEdge.latLongA.lat.toFixed(4))
        ) {
          edges.unshift(dangler)
          found = true
          break
        }
        // check back

        const back = edges[edges.length - 1]
        const backEdge = this.edges.get(back)!
        if (
          (danglerEdge.latLongB.lon.toFixed(4) ===
            backEdge.latLongB.lon.toFixed(4) &&
            danglerEdge.latLongB.lat.toFixed(4) ===
              backEdge.latLongB.lat.toFixed(4)) ||
          (danglerEdge.latLongA.lon.toFixed(4) ===
            backEdge.latLongB.lon.toFixed(4) &&
            danglerEdge.latLongA.lat.toFixed(4) ===
              backEdge.latLongB.lat.toFixed(4))
        ) {
          edges.push(dangler)
          found = true
          break
        }
      }
      if (!found) {
        this.danglers.push(dangler)
        console.warn("no match in while loop ", danglerEdge, this)
      }
    }
  }

  copy(boundary: PlateBoundary) {
    this.regions = new MapSet(boundary.regions)
    this.plates = new Set(boundary.plates)
    this.edges = new Map(boundary.edges)
    this.sortedContiguousEdges = new Set(boundary.sortedContiguousEdges)
    return this
  }
  static copy(boundary: PlateBoundary) {
    const newBoundary = new PlateBoundary().copy(boundary)
    return newBoundary
  }
  static createKey(plateA: IPlate, plateB: IPlate) {
    return [plateA.id, plateB.id].sort().join("-")
  }
}
