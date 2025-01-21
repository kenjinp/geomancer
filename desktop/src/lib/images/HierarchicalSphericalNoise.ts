import * as THREE from "three";

interface SphericalPoint {
  theta: number; // Azimuthal angle (longitude) [0, 2π]
  phi: number; // Polar angle (latitude) [0, π]
  level: number; // Hierarchy level (0 is sparsest)
}

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Options {
  baseRadius: number; // Radius for sparsest level
  maxLevels: number; // Maximum number of hierarchy levels
  radiusRatio?: number; // How much radius decreases per level
  k?: number; // Sampling attempts per point
  backgroundColor?: Color;
  pointColor?: Color;
}

export class HierarchicalSphericalNoise {
  private baseRadius: number;
  private maxLevels: number;
  private radiusRatio: number;
  private k: number;
  private points: SphericalPoint[];
  private activePoints: SphericalPoint[];
  private backgroundColor: Color;
  private pointColor: Color;
  private grids: (SphericalPoint | null)[][][]; // One grid per level

  constructor(options: Options) {
    this.baseRadius = options.baseRadius;
    this.maxLevels = options.maxLevels;
    this.radiusRatio = options.radiusRatio || 0.5;
    this.k = options.k || 30;
    this.points = [];
    this.activePoints = [];
    this.backgroundColor = options.backgroundColor || {
      r: 0,
      g: 0,
      b: 0,
      a: 255,
    };
    this.pointColor = options.pointColor || { r: 255, g: 255, b: 255, a: 255 };

    // Initialize acceleration grids for each level
    this.grids = [];
    for (let level = 0; level < this.maxLevels; level++) {
      const radius = this.getRadiusForLevel(level);
      const cellSize = radius / Math.sqrt(2);
      const thetaCells = Math.ceil((2 * Math.PI) / cellSize);
      const phiCells = Math.ceil(Math.PI / cellSize);
      this.grids[level] = Array(thetaCells)
        .fill(null)
        .map(() => Array(phiCells).fill(null));
    }
  }

  private getRadiusForLevel(level: number): number {
    return this.baseRadius * Math.pow(this.radiusRatio, level);
  }

  private sphericalDistance(p1: SphericalPoint, p2: SphericalPoint): number {
    const cosDistance =
      Math.sin(p1.phi) * Math.sin(p2.phi) +
      Math.cos(p1.phi) *
        Math.cos(p2.phi) *
        Math.cos(Math.abs(p1.theta - p2.theta));
    return Math.acos(Math.min(1, Math.max(-1, cosDistance)));
  }

  private addToGrid(point: SphericalPoint): void {
    const radius = this.getRadiusForLevel(point.level);
    const cellSize = radius / Math.sqrt(2);
    const grid = this.grids[point.level];
    const thetaIndex = Math.floor((point.theta / (2 * Math.PI)) * grid.length);
    const phiIndex = Math.floor((point.phi / Math.PI) * grid[0].length);
    grid[thetaIndex][phiIndex] = point;
  }

  private isValidForLevel(point: SphericalPoint, level: number): boolean {
    // Check against all points up to and including this level
    for (let l = 0; l <= level; l++) {
      const radius = this.getRadiusForLevel(l);
      const grid = this.grids[l];
      const cellSize = radius / Math.sqrt(2);
      const thetaIndex = Math.floor(
        (point.theta / (2 * Math.PI)) * grid.length
      );
      const phiIndex = Math.floor((point.phi / Math.PI) * grid[0].length);

      // Check neighboring cells
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const checkThetaIndex = (thetaIndex + i + grid.length) % grid.length;
          const checkPhiIndex = phiIndex + j;

          if (checkPhiIndex < 0 || checkPhiIndex >= grid[0].length) continue;

          const checkPoint = grid[checkThetaIndex][checkPhiIndex];
          if (checkPoint) {
            const dist = this.sphericalDistance(point, checkPoint);
            if (dist < radius) return false;
          }
        }
      }
    }
    return true;
  }

  private generateRandomPointAround(
    point: SphericalPoint,
    level: number
  ): SphericalPoint {
    const radius = this.getRadiusForLevel(level);

    // Generate points with area-preserving distribution
    const u = Math.random();
    const v = Math.random();

    // Use rejection sampling to ensure uniform distribution on sphere
    const phi = Math.acos(1 - 2 * u); // This gives uniform distribution in phi
    const theta = 2 * Math.PI * v;

    // Calculate offset from base point (using spherical rotation)
    const offset = radius * (1.5 + Math.random() * 0.5); // Random offset between 1.5r and 2r
    const rotAxis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    ).normalize();

    // Convert base point to cartesian
    const baseVector = new THREE.Vector3(
      Math.sin(point.phi) * Math.cos(point.theta),
      Math.sin(point.phi) * Math.sin(point.theta),
      Math.cos(point.phi)
    );

    // Rotate around random axis by offset angle
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeRotationAxis(rotAxis, offset);
    const newVector = baseVector.clone().applyMatrix4(rotMatrix);

    // Convert back to spherical
    const newTheta = Math.atan2(newVector.y, newVector.x);
    const newPhi = Math.acos(newVector.z / newVector.length());

    return {
      theta: (newTheta + 2 * Math.PI) % (2 * Math.PI),
      phi: Math.max(0.0001, Math.min(Math.PI - 0.0001, newPhi)),
      level,
    };
  }

  generateLevel(level: number): SphericalPoint[] {
    if (level >= this.maxLevels) return [];

    // For first level, start with random points
    if (level === 0) {
      const firstPoint: SphericalPoint = {
        theta: Math.random() * 2 * Math.PI,
        phi: Math.acos(2 * Math.random() - 1),
        level: 0,
      };
      this.points.push(firstPoint);
      this.activePoints.push(firstPoint);
      this.addToGrid(firstPoint);
    }

    // Use existing points as seeds for new level
    const existingPoints = [...this.points];

    for (const seedPoint of existingPoints) {
      for (let i = 0; i < this.k; i++) {
        const newPoint = this.generateRandomPointAround(seedPoint, level);

        if (this.isValidForLevel(newPoint, level)) {
          this.points.push(newPoint);
          this.activePoints.push(newPoint);
          this.addToGrid(newPoint);
        }
      }
    }

    return this.getPointsAtLevel(level);
  }

  getPointsAtLevel(level: number): SphericalPoint[] {
    return this.points.filter((p) => p.level === level);
  }

  getAllPointsUpToLevel(level: number): SphericalPoint[] {
    return this.points.filter((p) => p.level <= level);
  }

  createTextureForLevel(
    level: number,
    resolution: number = 512
  ): THREE.DataTexture {
    const data = new Uint8Array(resolution * resolution * 4);

    // Fill with background color
    for (let i = 0; i < data.length; i += 4) {
      data[i] = this.backgroundColor.r;
      data[i + 1] = this.backgroundColor.g;
      data[i + 2] = this.backgroundColor.b;
      data[i + 3] = this.backgroundColor.a;
    }

    // Draw points up to and including this level
    const points = this.getAllPointsUpToLevel(level);

    points.forEach((point) => {
      const radius = this.getRadiusForLevel(point.level);
      const pixelRadius = Math.floor((radius * resolution) / Math.PI);

      // Convert spherical to equirectangular projection
      const centerX = Math.floor((point.theta / (2 * Math.PI)) * resolution);
      // Use area-preserving mapping for latitude
      const y = 1 - (Math.cos(point.phi) + 1) / 2;
      const centerY = Math.floor(y * resolution);

      // Calculate pixel radius with latitude compensation
      const adjustedRadius = pixelRadius / Math.max(Math.sin(point.phi), 0.1);

      for (let dx = -adjustedRadius; dx <= adjustedRadius; dx++) {
        for (let dy = -adjustedRadius; dy <= adjustedRadius; dy++) {
          const distSquared = dx * dx + dy * dy;

          if (distSquared <= adjustedRadius * adjustedRadius) {
            let x = centerX + dx;
            let y = centerY + dy;

            // Handle wrapping for spherical texture
            x = (x + resolution) % resolution;
            if (y < 0 || y >= resolution) continue;

            // Calculate distance for gradient, compensating for latitude
            const t = Math.sqrt(distSquared) / adjustedRadius;
            const color = this.lerpColor(
              this.pointColor,
              this.backgroundColor,
              t
            );

            const index = (y * resolution + x) * 4;
            data[index] = color.r;
            data[index + 1] = color.g;
            data[index + 2] = color.b;
            data[index + 3] = color.a;
          }
        }
      }
    });

    const texture = new THREE.DataTexture(
      data,
      resolution,
      resolution,
      THREE.RGBAFormat
    );
    texture.needsUpdate = true;
    return texture;
  }

  private lerpColor(color1: Color, color2: Color, t: number): Color {
    return {
      r: Math.round(color1.r * (1 - t) + color2.r * t),
      g: Math.round(color1.g * (1 - t) + color2.g * t),
      b: Math.round(color1.b * (1 - t) + color2.b * t),
      a: Math.round(color1.a * (1 - t) + color2.a * t),
    };
  }
}
