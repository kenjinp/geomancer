import { UNITS, getHexagonEdgeLengthAvg } from "h3-js"

export const RESOLUTION = 3
// est for 2 = 1_000 ms
// est for 3 = 35_000 ms :[
// want to find a way to speed this up!

export const AREAS = [
  4357449416078.392, 609788441794.134, 86801780398.997, 12393434655.088,
  1770347654.491, 252903858.182, 36129062.164, 5161293.36, 737327.598,
  105332.513, 15047.502, 2149.643, 307.092, 43.87, 6.267, 0.895,
]

export const REGION_AREA = AREAS[RESOLUTION]

export const avgEdgeLengthMeters = getHexagonEdgeLengthAvg(RESOLUTION, UNITS.m)
