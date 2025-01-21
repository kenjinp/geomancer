export class PerlinNoise {
  private perm: Uint8Array;

  constructor(seed = Math.random()) {
    // Initialize permutation table
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);

    // Fill array with values 0...255
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }

    // Fisher-Yates shuffle with seed
    let random = seed;
    for (let i = 255; i > 0; i--) {
      random = (random * 16807) % 2147483647;
      const j = Math.floor((random / 2147483647) * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Duplicate permutation to avoid overflow
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const grad_x = 1 + (h & 7); // Gradient x
    const grad_y = 1 + (h >> 4); // Gradient y
    return (h & 8 ? -grad_x : grad_x) * x + (h & 8 ? -grad_y : grad_y) * y;
  }

  noise(x: number, y: number): number {
    // Find unit square that contains point
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    // Find relative x,y of point in square
    x -= Math.floor(x);
    y -= Math.floor(y);

    // Compute fade curves
    const u = this.fade(x);
    const v = this.fade(y);

    // Hash coordinates of cube corners
    const A = this.perm[X] + Y;
    const AA = this.perm[A];
    const AB = this.perm[A + 1];
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B];
    const BB = this.perm[B + 1];

    // Add blended results from corners
    return this.lerp(
      v,
      this.lerp(
        u,
        this.grad(this.perm[AA], x, y),
        this.grad(this.perm[BA], x - 1, y)
      ),
      this.lerp(
        u,
        this.grad(this.perm[AB], x, y - 1),
        this.grad(this.perm[BB], x - 1, y - 1)
      )
    );
  }

  // Generate octaves of noise for more natural terrain
  octaveNoise(
    x: number,
    y: number,
    octaves: number,
    persistence: number
  ): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }
}
