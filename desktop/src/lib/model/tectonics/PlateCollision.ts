import { Vector3 } from "three";
import { Plate } from "./Plate";

/**
 * Types of plate boundaries/collisions
 */
export enum CollisionType {
  NONE = 0,
  CONVERGENT = 1, // Plates moving toward each other (subduction, mountain building)
  DIVERGENT = 2, // Plates moving away from each other (rifting, sea floor spreading)
  TRANSFORM = 3, // Plates sliding past each other horizontally
}

/**
 * Represents a collision between two tectonic plates
 */
export interface PlateCollision {
  plateA: number; // ID of first plate
  plateB: number; // ID of second plate
  collisionType: CollisionType;
  intensity: number; // 0-1 normalized intensity of collision
  position: Vector3; // Position in 3D space where collision occurs
  hexIndex: number; // Index of hex at collision point
}

/**
 * Helper class with methods for plate collision detection and classification
 */
export class PlateCollisionDetector {
  /**
   * Determines the collision type between two plates based on their relative motion
   */
  static determineCollisionType(
    plateA: Plate,
    plateB: Plate,
    collisionPosition: Vector3
  ): CollisionType {
    // Get the movement vectors at the collision point for both plates
    const plateAMovement = this.getPlateMovementVector(
      plateA,
      collisionPosition
    );
    const plateBMovement = this.getPlateMovementVector(
      plateB,
      collisionPosition
    );

    // Calculate the relative movement vector
    const relativeMovement = new Vector3().subVectors(
      plateAMovement,
      plateBMovement
    );

    // Create normal vector to the collision surface (approximated by the position vector)
    const normal = collisionPosition.clone().normalize();

    // Project relative movement onto normal to get convergence/divergence component
    const normalComponent = relativeMovement.dot(normal);

    // Calculate tangential component (for transform faults)
    const tangentialComponent = new Vector3()
      .crossVectors(relativeMovement, normal)
      .length();

    // Determine collision type based on movement components
    if (Math.abs(normalComponent) < 0.3 && tangentialComponent > 0.7) {
      return CollisionType.TRANSFORM; // Mostly sideways movement
    } else if (normalComponent > 0.3) {
      return CollisionType.CONVERGENT; // Plates moving toward each other
    } else if (normalComponent < -0.3) {
      return CollisionType.DIVERGENT; // Plates moving away from each other
    }

    // Default if no strong pattern is detected
    return CollisionType.TRANSFORM;
  }

  /**
   * Gets the movement vector for a plate at a specific position
   */
  private static getPlateMovementVector(
    plate: Plate,
    position: Vector3
  ): Vector3 {
    // Calculate tangential movement vector based on plate's rotation axis and rate
    const tangentialVelocity = new Vector3()
      .crossVectors(plate.driftAxis, position.clone().normalize())
      .multiplyScalar(plate.driftRate);

    return tangentialVelocity;
  }

  /**
   * Calculates the collision intensity based on relative movement
   */
  static calculateCollisionIntensity(
    plateA: Plate,
    plateB: Plate,
    position: Vector3
  ): number {
    const plateAMovement = this.getPlateMovementVector(plateA, position);
    const plateBMovement = this.getPlateMovementVector(plateB, position);

    // Calculate relative velocity magnitude
    const relativeSpeed = new Vector3()
      .subVectors(plateAMovement, plateBMovement)
      .length();

    // Normalize to 0-1 range (assuming maximum relative speed is around PI/15)
    const normalizedIntensity = Math.min(relativeSpeed / (Math.PI / 15), 1.0);

    return normalizedIntensity;
  }
}
