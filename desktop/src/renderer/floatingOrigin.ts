import type { Object3D, PerspectiveCamera } from "three";
import { Vector3 } from "three";

/**
 * A snapped floating origin for planet-scale rendering.
 *
 * The planet is centred at the world origin with a ~6.37e6 m radius, so on the
 * surface every vertex — and the camera — sits millions of metres from 0,0,0.
 * three uploads the view matrix as float32, whose translation re-quantises onto
 * a ~0.5 m grid as the camera moves; everything drawn through it shakes (the
 * "vibration"). Computing the surface procedurally in float32 (`dir·r`) adds a
 * small static distortion on top, but the *vibration* is the view matrix.
 *
 * The fix is to render in a camera-relative frame: pick an origin `O` near the
 * camera, translate the camera and the rendered world by `-O`, and the GPU then
 * only ever sees small coordinates → the view-matrix translation is tiny and
 * float32-precise → the vibration is gone.
 *
 * Two details make it robust:
 * - `O` is **snapped** to a power-of-two grid so it is exactly representable in
 *   float32 and only changes in discrete steps. Between steps `dir·r − O` is
 *   constant, so nothing shimmers; at a step both the world and the camera jump
 *   by exactly the same amount, so the shift is render-invariant (no pop).
 * - Rendering only. Simulation, terrain queries, raycasts and pointer events
 *   keep running in true world coordinates; {@link shift} is applied right
 *   before the draw and {@link restore} immediately after.
 */
export class FloatingOrigin {
  /** The current snapped origin: the true-world point the scene is shifted by. */
  readonly origin = new Vector3();

  private readonly trueCameraPosition = new Vector3();
  private active = false;

  /** @param grid Snap step in metres. Must be a power of two for exactness. */
  constructor(public grid = 1024) {}

  /**
   * Translate `camera` and `world` into the camera-relative frame. Call once,
   * immediately before rendering, after all simulation has run for the frame.
   */
  shift(camera: PerspectiveCamera, world: Object3D): void {
    if (this.active) return;
    camera.getWorldPosition(this.trueCameraPosition);

    const g = this.grid;
    this.origin.set(
      Math.round(this.trueCameraPosition.x / g) * g,
      Math.round(this.trueCameraPosition.y / g) * g,
      Math.round(this.trueCameraPosition.z / g) * g,
    );

    camera.position.sub(this.origin);
    camera.updateMatrixWorld(true);
    world.position.copy(this.origin).negate();
    world.updateMatrixWorld(true);
    this.active = true;
  }

  /**
   * Undo {@link shift} so controllers, raycasts and pointer events see true
   * world coordinates again. Call immediately after rendering.
   */
  restore(camera: PerspectiveCamera, world: Object3D): void {
    if (!this.active) return;
    camera.position.add(this.origin);
    camera.updateMatrixWorld(true);
    world.position.set(0, 0, 0);
    world.updateMatrixWorld(true);
    this.active = false;
  }
}
