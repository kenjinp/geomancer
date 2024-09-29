import { randomRange } from "@hello-worlds/core"
import { LatLong, Noise } from "@hello-worlds/planets"
import { Color, MathUtils, Vector3 } from "three"
import { IGeology } from "../Geology.types"

const tempVec3 = new Vector3()
export class Hotspot {
  id = MathUtils.generateUUID()
  children: Hotspot[] = []
  #noise: Noise
  #geology: IGeology
  color: Color
  constructor(
    public magnitude: number,
    public coordinates: LatLong,
    geology: IGeology,
  ) {
    this.#geology = geology
    this.#noise = new Noise({
      seed: geology.params.seed,
      height: geology.params.radius / 10,
      scale: geology.params.radius,
    })
    this.color = new Color(randomRange(0, 1) * 0xffffff)
  }

  set(magnitude: number, coordinates: LatLong) {
    this.magnitude = magnitude
    this.coordinates = coordinates
  }

  calculateChainEffect() {
    const hostingPlate = this.#geology.getPlateFromLatLong(this.coordinates)
    const numberOfChainsTries = 5
    // get movement vector
    // move a random amount towards the movement vector along the surface of the sphere
    // deposit new hotspot child
    for (let i = 0; i < numberOfChainsTries; i++) {
      const last = this.children[i - 1] || this
      const newMagnitude = last.magnitude * randomRange(0.3, 0.95)
      // if (newMagnitude < this.magnitude * 0.01) {
      //   break
      // }
      let newCoordinates = last.coordinates.clone()
      const hostPlate = this.#geology.getPlateFromLatLong(newCoordinates)
      if (!hostPlate) {
        break
      }

      const newPosition = newCoordinates.toCartesian(
        this.#geology.params.radius,
        new Vector3(),
      )

      const movementAtHotspot = hostPlate.calculateMovement(
        newPosition,
        this.#geology.params.radius,
      )
      // newPosition.projectOnVector(movementAtHotspot)
      const coords = newCoordinates.cartesianToLatLong(movementAtHotspot)

      const newHotspot = new Hotspot(newMagnitude, coords, this.#geology)
      this.children.push(newHotspot)
    }
  }

  random() {
    const magnitude = randomRange(0, 1)
    const coordinates = new LatLong(
      randomRange(-90, 90),
      randomRange(-180, 180),
    )

    this.set(magnitude, coordinates)
  }

  static random(geology: IGeology) {
    const hotspot = new Hotspot(0, new LatLong(0, 0), geology)
    hotspot.random()
    return hotspot
  }

  static copy(hotspot: Hotspot, geology: IGeology) {
    const newHotspot = new Hotspot(
      hotspot.magnitude,
      new LatLong().copy(hotspot.coordinates),
      geology,
    )
    newHotspot.children = hotspot.children.map(child =>
      Hotspot.copy(child, geology),
    )
    return newHotspot
  }
}
