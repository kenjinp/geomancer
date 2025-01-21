export interface SimulationParams {
  readonly GRID_SIZE: number;
  readonly NUM_PARTICLES: number;
  readonly INERTIA: number;
  readonly SEDIMENT_CAPACITY: number;
  readonly MIN_SEDIMENT_CAPACITY: number;
  readonly DEPOSITION_SPEED: number;
  readonly EROSION_SPEED: number;
  readonly EVAPORATION_SPEED: number;
  readonly GRAVITY: number;
}

export const SIMULATION_PARAMS: SimulationParams = {
  GRID_SIZE: 512,
  NUM_PARTICLES: 1024 * 2,
  INERTIA: 0.05,
  SEDIMENT_CAPACITY: 4,
  MIN_SEDIMENT_CAPACITY: 0.01,
  DEPOSITION_SPEED: 0.3,
  EROSION_SPEED: 0.3,
  EVAPORATION_SPEED: 0.01,
  GRAVITY: 4,
};
