import * as THREE from "three";

interface Point {
  x: number;
  y: number;
}

interface Color {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-255
}

interface Options {
  width: number;
  height: number;
  radius: number; // Sampling radius (minimum distance between points)
  visualRadius?: number; // Radius for drawing circles (defaults to radius/2 if not specified)
  k: number; // Number of samples before rejection
  periodicity: boolean;
  backgroundColor?: Color;
  pointColor?: Color;
}

export class TileableBlueNoise {
  private width: number;
  private height: number;
  private radius: number;
  private visualRadius: number;
  private k: number;
  private cellSize: number;
  private grid: (Point | null)[][];
  private points: Point[];
  private activePoints: Point[];
  private isPeriodic: boolean;
  private backgroundColor: Color;
  private pointColor: Color;

  constructor(options: Options) {
    this.width = options.width;
    this.height = options.height;
    this.radius = options.radius;
    this.visualRadius = options.visualRadius || options.radius / 2; // Default to half the sampling radius
    this.k = options.k || 30;
    this.isPeriodic = options.periodicity;

    // Default colors if not provided
    this.backgroundColor = options.backgroundColor || {
      r: 0,
      g: 0,
      b: 0,
      a: 255,
    };
    this.pointColor = options.pointColor || { r: 255, g: 255, b: 255, a: 255 };

    // Cell size for acceleration grid
    this.cellSize = this.radius / Math.sqrt(2);

    // Initialize acceleration grid
    const cols = Math.ceil(this.width / this.cellSize);
    const rows = Math.ceil(this.height / this.cellSize);
    this.grid = Array(cols)
      .fill(null)
      .map(() => Array(rows).fill(null));

    this.points = [];
    this.activePoints = [];
  }

  private distance(p1: Point, p2: Point): number {
    let dx = Math.abs(p1.x - p2.x);
    let dy = Math.abs(p1.y - p2.y);

    if (this.isPeriodic) {
      dx = Math.min(dx, this.width - dx);
      dy = Math.min(dy, this.height - dy);
    }

    return Math.sqrt(dx * dx + dy * dy);
  }

  private addToGrid(point: Point): void {
    const col = Math.floor(point.x / this.cellSize);
    const row = Math.floor(point.y / this.cellSize);
    this.grid[col][row] = point;
  }

  private isValid(point: Point): boolean {
    const col = Math.floor(point.x / this.cellSize);
    const row = Math.floor(point.y / this.cellSize);

    // Check surrounding cells
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        let checkCol = col + i;
        let checkRow = row + j;

        if (this.isPeriodic) {
          checkCol = (checkCol + this.grid.length) % this.grid.length;
          checkRow = (checkRow + this.grid[0].length) % this.grid[0].length;
        } else if (
          checkCol < 0 ||
          checkCol >= this.grid.length ||
          checkRow < 0 ||
          checkRow >= this.grid[0].length
        ) {
          continue;
        }

        const checkPoint = this.grid[checkCol][checkRow];
        if (checkPoint) {
          const dist = this.distance(point, checkPoint);
          if (dist < this.radius) return false;
        }
      }
    }

    return true;
  }

  private generateRandomPointAround(point: Point): Point {
    // Use a grid-based approach for better rotational symmetry
    const gridSize = 8; // Number of angular divisions
    const ring = Math.floor(Math.random() * 3) + 1; // Which ring to place the point in
    const segment = Math.floor(Math.random() * gridSize); // Which segment to place it in

    // Calculate angle based on segment
    const angle = (segment / gridSize) * Math.PI * 2;
    // Use fixed radius multipliers for each ring to ensure even coverage
    const radiusMultipliers = [1.4, 1.7, 2.0];
    const radius = this.radius * radiusMultipliers[ring - 1];

    let newX = point.x + radius * Math.cos(angle);
    let newY = point.y + radius * Math.sin(angle);

    if (this.isPeriodic) {
      newX = (newX + this.width) % this.width;
      newY = (newY + this.height) % this.height;
    }

    return { x: newX, y: newY };
  }

  generate(): Point[] {
    // Start with a random point
    const firstPoint: Point = {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
    };

    this.points.push(firstPoint);
    this.activePoints.push(firstPoint);
    this.addToGrid(firstPoint);

    while (this.activePoints.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.activePoints.length);
      const point = this.activePoints[randomIndex];
      let found = false;

      // Try k random points around this point
      for (let i = 0; i < this.k; i++) {
        const newPoint = this.generateRandomPointAround(point);

        if (
          newPoint.x >= 0 &&
          newPoint.x < this.width &&
          newPoint.y >= 0 &&
          newPoint.y < this.height &&
          this.isValid(newPoint)
        ) {
          this.points.push(newPoint);
          this.activePoints.push(newPoint);
          this.addToGrid(newPoint);
          found = true;
          break;
        }
      }

      // If no valid point was found after k attempts, remove this point from active list
      if (!found) {
        this.activePoints.splice(randomIndex, 1);
      }
    }

    return this.points;
  }

  private lerp(start: number, end: number, t: number): number {
    return start * (1 - t) + end * t;
  }

  private lerpColor(color1: Color, color2: Color, t: number): Color {
    return {
      r: Math.round(this.lerp(color1.r, color2.r, t)),
      g: Math.round(this.lerp(color1.g, color2.g, t)),
      b: Math.round(this.lerp(color1.b, color2.b, t)),
      a: Math.round(this.lerp(color1.a, color2.a, t)),
    };
  }

  // Create a Three.js texture from the generated points with gradient circles
  createTexture(resolution: number = 512): THREE.DataTexture {
    const data = new Uint8Array(resolution * resolution * 4);

    // Fill with background color
    for (let i = 0; i < data.length; i += 4) {
      data[i] = this.backgroundColor.r; // R
      data[i + 1] = this.backgroundColor.g; // G
      data[i + 2] = this.backgroundColor.b; // B
      data[i + 3] = this.backgroundColor.a; // A
    }

    // Draw gradient circles for each point
    const pixelRadius = Math.floor(
      (this.visualRadius / this.width) * resolution
    );
    const radiusSquared = pixelRadius * pixelRadius;

    this.points.forEach((point) => {
      const centerX = Math.floor((point.x / this.width) * resolution);
      const centerY = Math.floor((point.y / this.height) * resolution);

      // Draw a gradient circle around each point
      for (let dx = -pixelRadius; dx <= pixelRadius; dx++) {
        for (let dy = -pixelRadius; dy <= pixelRadius; dy++) {
          const distSquared = dx * dx + dy * dy;

          // Check if point is within circle
          if (distSquared <= radiusSquared) {
            let x = centerX + dx;
            let y = centerY + dy;

            // Handle wrapping for tileable texture
            if (this.isPeriodic) {
              x = (x + resolution) % resolution;
              y = (y + resolution) % resolution;
            } else if (x < 0 || x >= resolution || y < 0 || y >= resolution) {
              continue;
            }

            // Calculate distance ratio for interpolation (0 at center, 1 at edge)
            const t = Math.sqrt(distSquared) / pixelRadius;

            // Interpolate between point color and background color
            const color = this.lerpColor(
              this.pointColor,
              this.backgroundColor,
              t
            );

            const index = (y * resolution + x) * 4;
            data[index] = color.r; // R
            data[index + 1] = color.g; // G
            data[index + 2] = color.b; // B
            data[index + 3] = color.a; // A
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
}
