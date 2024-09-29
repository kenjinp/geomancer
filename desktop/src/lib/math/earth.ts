import { Euler } from "three"

// earth facts
export const MIN_ELEVATION = 10_935 // challanger deep
export const MAX_ELEVATION = 8_848 // everest
export const AVG_OCEAN_DEPTH = 3_682
export const AVG_LAND_ELEVATION = 840
export const AREA_EARTH = 4_357_449_416_078.392 * 122
export const AXIAL_TILT = new Euler(0, 0, (-23.5 * Math.PI) / 180)
