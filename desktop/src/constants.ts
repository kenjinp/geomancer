/** Solar radius in meters (IAU nominal). */
export const SUN_RADIUS = 696_340_000;

export const EARTH_AUTHALIC_RADIUS = 6_371_007.2;
export const EARTH_SURFACE_AREA =
  4 * Math.PI * EARTH_AUTHALIC_RADIUS * EARTH_AUTHALIC_RADIUS;

/**
 * Earth-area torus dimensions. A torus has surface area `4π²Rr`; keeping
 * `R / r = 3` gives a readable donut while matching Earth's authalic area.
 */
export const EARTH_AREA_TORUS_MAJOR_MINOR_RATIO = 3;
export const EARTH_AREA_TORUS_MINOR_RADIUS =
  EARTH_AUTHALIC_RADIUS /
  Math.sqrt(Math.PI * EARTH_AREA_TORUS_MAJOR_MINOR_RATIO);
export const EARTH_AREA_TORUS_MAJOR_RADIUS =
  EARTH_AREA_TORUS_MINOR_RADIUS * EARTH_AREA_TORUS_MAJOR_MINOR_RATIO;
export const EARTH_AREA_TORUS_BOUNDING_RADIUS =
  EARTH_AREA_TORUS_MAJOR_RADIUS + EARTH_AREA_TORUS_MINOR_RADIUS;

export const H3_RESOLUTION = 4;
export const AU = 149_597_870_700;

declare const __COMMIT_INFO__: {
  shortHash: string;
  hash: string;
  subject: string;
  sanitizedSubject: string;
  body: string;
  authoredOn: string;
  committedOn: string;
  author: {
    name: string;
    email: string;
  };
  committer: {
    name: string;
    email: string;
  };
  notes: string;
  branch: string;
  tags: string[];
};

declare const __BUILD_INFO__: {
  buildTime: number;
};

export const COMMIT_INFO = __COMMIT_INFO__;
export const BUILD_INFO = __BUILD_INFO__;
