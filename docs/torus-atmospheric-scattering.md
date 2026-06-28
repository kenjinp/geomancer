# Torus Atmospheric Scattering

This note explains the torus atmosphere used by the torus world renderer.
The implementation lives in:

- `desktop/src/renderer/components/atmosphere/TorusAtmosphere.tsx`
- `desktop/src/renderer/tsl/torusAtmosphere.ts`
- `desktop/src/renderer/components/TorusTerrainRenderer.tsx`

The effect is a screen-space, raymarched volumetric atmosphere wrapped around a
torus distance field. It is deliberately parallel to the spherical atmosphere,
but the altitude and shadowing logic are torus-specific.

## World Scale

The torus world uses dimensions chosen to match Earth's authalic surface area.
For a torus:

```text
surfaceArea = 4 * pi^2 * majorRadius * minorRadius
```

Geomancer fixes `majorRadius / minorRadius = 3` and solves for the minor radius
from Earth's area. These values are exported from `desktop/src/constants.ts` as:

- `EARTH_AREA_TORUS_MINOR_RADIUS`
- `EARTH_AREA_TORUS_MAJOR_RADIUS`
- `EARTH_AREA_TORUS_BOUNDING_RADIUS`

The atmosphere receives the major and minor radii in metres, then converts
positions and optical coefficients to kilometres inside the shader because the
scattering constants are expressed per kilometre.

## Torus Altitude Field

The key replacement for a planet radius is a torus altitude function. For a
sample point `p`, centered around `center`:

```text
q = p - center
rho = sqrt(q.x^2 + q.z^2)
ringDistance = rho - majorRadius
tubeDistance = sqrt(ringDistance^2 + q.y^2)
altitude = tubeDistance - minorRadius
```

That altitude is the signed distance from the base torus tube:

- `altitude < 0`: inside solid terrain
- `altitude = 0`: on the nominal torus surface
- `0 <= altitude <= atmosphereThickness`: inside the atmosphere shell
- `altitude > atmosphereThickness`: outside the atmosphere

This makes atmospheric density follow the tube all the way around the ring,
including the inner side of the torus and the central opening.

## Render Pipeline

`TorusAtmosphere` is a post-processing pass. Each frame it:

1. Renders the scene from a sun-facing orthographic camera into a depth texture.
2. Updates camera, sun, projection, and shadow uniforms.
3. Runs the TSL node produced by `createTorusAtmosphereNode`.
4. Composites the scattered atmosphere over the scene color.

The pass samples the existing scene color and logarithmic depth buffer. From
screen UV and depth, it reconstructs the world-space position visible at that
pixel. The atmosphere ray starts at the camera and points toward that position.

If the pixel contains foreground geometry, the ray is clamped to the foreground
distance so atmosphere is integrated only in front of that surface. If the pixel
is background sky, the ray can march through the full atmospheric volume.

## Ray Bounds

The shader uses a bounding sphere around the whole torus atmosphere to find a
cheap near/far interval for the view ray:

```text
boundRadius = majorRadius + minorRadius + atmosphereThickness
```

This sphere is only an acceleration bound. The actual atmospheric shell is still
defined by `torusAltitude`, so samples outside the torus-shaped shell contribute
zero density.

## Density Model

At every raymarch sample, `sampleDensity` computes three density channels:

- Rayleigh density: `exp(-height / 8 km)`
- Mie density: `exp(-height / 1.2 km)`
- Ozone density: a triangular band centered around `25 km` with `15 km` width

Only samples with `0 <= height <= atmosphereThickness` contribute. Samples
inside the torus or above the atmosphere return zero density.

The scattering and absorption coefficients are Earth-like approximations:

```text
betaRayleigh       = vec3(0.0058, 0.0135, 0.0331) per km
betaMieScatter     = vec3(0.0030, 0.0030, 0.0030) per km
betaMieExtinction  = betaMieScatter * 1.1
betaOzoneAbsorption = vec3(0.00065, 0.00188, 0.00008) per km
```

Rayleigh produces the blue sky and redder long paths. Mie creates forward
scattering around the sun. Ozone absorbs part of the spectrum along high
atmosphere paths.

## Primary View March

The primary march integrates along the camera ray. For each step it:

1. Samples torus-shell density.
2. Accumulates view optical depth for Rayleigh, Mie, and ozone.
3. Runs a secondary light march from the sample point toward the sun.
4. Computes transmittance with:

```text
tau =
  betaRayleigh * (viewRayleighDepth + sunRayleighDepth)
  + betaMieExtinction * (viewMieDepth + sunMieDepth)
  + betaOzoneAbsorption * (viewOzoneDepth + sunOzoneDepth)

transmittance = exp(-tau)
```

5. Applies the sun-depth shadow visibility.
6. Accumulates Rayleigh and Mie in-scattering.

After the loop, the accumulated scattering is weighted by the phase functions:

- Rayleigh phase is symmetric and strongest forward/backward.
- Mie phase uses `g = 0.76`, giving a bright forward-scattering sun glow.

The final atmosphere color is:

```text
sceneColor * viewTransmittance + inScattering
```

## Secondary Light March

The light march estimates how much atmosphere sunlight passes through before
reaching a primary sample. It marches from the sample point in `uSunDirection`
until it leaves the bounding sphere.

It uses the same torus altitude field as the view march. If any light sample
enters the solid torus (`torusAltitude < 0`), the light path is treated as
blocked by assigning a huge optical depth. That produces the torus equivalent of
night-side atmospheric extinction.

## Sun Depth Shadows

The shader also uses a rendered sun-depth texture. `TorusAtmosphere.tsx` places
an orthographic `sunCamera` near the closest torus surface point to the viewer,
looking back along the sun direction. The camera extent grows with viewer
altitude and is clamped to a useful local range.

During the atmosphere pass, `sunVisibility` projects each sample into this sun
camera. If the sun-depth texture contains closer geometry, the sample is faded
toward shadow. This catches local terrain occlusion and gives the atmosphere a
more grounded terminator than pure analytic torus blocking alone.

The shadow controls are:

- `uShadowBias`
- `uShadowSoftness`
- `uShadowEnabled`

`uShadowEnabled` fades down with altitude so close-up terrain shadows matter
near the surface without over-darkening large orbital views.

## Runtime Controls

`TorusAtmosphere` exposes:

- `atmosphereThickness`, default `120_000` metres
- `sunIntensity`, default `22`
- `primarySteps`, default `36`
- `lightSteps`, default `8`
- `shadowMapSize`, default `2048`
- `shadows`, default `true`
- `enabled`, wired to the atmosphere map layer toggle

Increasing `primarySteps` smooths view scattering. Increasing `lightSteps`
improves sunset and occlusion accuracy. Both increase shader cost because the
total work is roughly `primarySteps * lightSteps` per shaded pixel.

## Why It Differs From A Spherical Atmosphere

A sphere can use simple radius-from-center altitude and analytic ray-sphere
intersections for both surface and atmosphere. A torus has two important
differences:

- Altitude is distance from the tube, not distance from the world origin.
- The solid body can block sunlight in curved, non-spherical ways, especially
  around the inner ring.

Geomancer handles this by using a torus signed-distance altitude function for
density and solid-body light blocking, while keeping a simple bounding sphere
only for cheap ray interval setup.

## Known Limitations

- The primary ray interval is bounded by a sphere, so the shader still visits
  some empty space around the torus and relies on `sampleDensity` to reject it.
- The sun-depth shadow pass is local to the viewer. It is designed for nearby
  terrain shadows, not a full global shadow map of the entire torus.
- The optical constants are Earth-like rather than derived from a torus-specific
  climate model.
- Multiple scattering is approximated by single scattering only.

These choices keep the effect interactive while preserving the most visible
features: blue sky, aerial perspective, sunset tinting, sun glow, night-side
falloff, and torus-shaped atmospheric curvature.
