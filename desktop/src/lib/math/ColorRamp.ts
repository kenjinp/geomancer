import { Lerp, LinearSpline, remap } from "@hello-worlds/planets"
import { Color } from "three"

export interface ColorElevation {
  color: string
  elevation: number
}

export const noaaRamp: ColorElevation[] = [
  { color: "#ffffff", elevation: 8000 },
  { color: "#E0D7D0", elevation: 4000 },
  { color: "#CDB99C", elevation: 2000 },
  { color: "#BA9468", elevation: 1000 },
  { color: "#9B7E43", elevation: 500 },
  { color: "#75752D", elevation: 250 },
  { color: "#456C18", elevation: 50 },
  { color: "#175515", elevation: 10 },
  { color: "#004023", elevation: 0.1 },
  { color: "#E0FCE4", elevation: 0 },
  { color: "#ABE2D7", elevation: -2 },
  { color: "#79C6CD", elevation: -10 },
  { color: "#5CACCA", elevation: -50 },
  { color: "#3F91C7", elevation: -250 },
  { color: "#2D75B0", elevation: -1000 },
  { color: "#225580", elevation: -2000 },
  { color: "#1D4052", elevation: -4000 },
  { color: "#1A3434", elevation: -8000 },
]
  .map(c => ({ ...c, elevation: remap(c.elevation, -8000, 8000, 0, 1) }))
  .sort((a, b) => a.elevation - b.elevation)

console.log({
  noaaRamp,
})

const colorLerp: Lerp<THREE.Color> = (
  t: number,
  p0: THREE.Color,
  p1: THREE.Color,
) => {
  const c = p0.clone()
  return c.lerp(p1, t)
}

function createColorSplineFromColorElevation(colorElevation: ColorElevation[]) {
  const colorSpline = new LinearSpline<Color>(colorLerp)
  colorElevation.forEach(({ color, elevation }) => {
    colorSpline.addPoint(elevation, new Color(color))
  })
  return colorSpline
}

export const nooaColorSpline = createColorSplineFromColorElevation(noaaRamp)
