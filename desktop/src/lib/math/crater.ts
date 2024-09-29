import { LatLong, Noise, smoothMax, smoothMin } from "@hello-worlds/planets"
import { Color, Vector3 } from "three"
import { lerp } from "three/src/math/MathUtils"

export type Crater = {
  floorHeight: number
  radius: number
  center: LatLong
  rimWidth: number
  rimSteepness: number
  smoothness: number
  debugColor: Color
}

const tempVec3 = new Vector3()
const tempLatLong = new LatLong()
export const craterHeight = (
  input: Vector3,
  craters: Crater[],
  planetRadius: number,
  noise?: Noise,
) => {
  let craterHeight = 0
  const noiseHeight = noise ? noise.getFromVector(input) : 0
  for (let i = 0; i < craters.length; i++) {
    const currentPoint = craters[i]
    const { rimWidth, rimSteepness, smoothness, floorHeight, center, radius } =
      currentPoint
    const centerVec3 = tempLatLong
      .set(center.lat, center.lon)
      .toCartesian(planetRadius, tempVec3)

    const dist = input.distanceTo(centerVec3) + noiseHeight
    if (dist > radius * 3) {
      continue
    }
    const x = dist / radius

    // crazy snaky terrace stuff
    // const radialDistanceNoise = Math.sin(
    //   dist * (1 / remap(radius, 1000, 200_000, 1000, 10000)),
    // )

    const cavity = x * x - 1
    const rimX = Math.min(x - 1 - rimWidth, 0)
    const rim = rimSteepness * rimX * rimX
    let craterShape = smoothMax(cavity, floorHeight, smoothness)
    craterShape = smoothMin(
      craterShape,
      rim * smoothMin(0.75, 1, 0.4),
      smoothness,
    )
    const min = Math.min(craterShape * radius, craterHeight)
    const max = Math.max(craterShape * radius, craterHeight)
    const sMin = smoothMin(min, max, 0.5)
    const sMax = smoothMax(min, max, 0.5)
    const lerpAmount = Math.min(1, x)

    craterHeight = Math.max(0, lerp(sMin, sMax, lerpAmount))
  }
  return craterHeight
}
