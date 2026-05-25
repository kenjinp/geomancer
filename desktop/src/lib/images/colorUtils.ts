export const integerToRGB = (int: number) => {
  let seed = int;

  // Mix bits using XOR and shifts (similar to hashH3Id)
  seed ^= seed << 13;
  seed ^= seed >> 17;
  seed ^= seed << 5;

  // Convert to RGB components between 0 and 1
  return [(seed >> 16) & 0xff, (seed >> 8) & 0xff, seed & 0xff];
};
