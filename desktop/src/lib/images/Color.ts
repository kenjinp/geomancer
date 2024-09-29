export const integerToRGB = (int: number) => {
  const red = (int >> 16) & 0xff
  const green = (int >> 8) & 0xff
  const blue = int & 0xff

  return [red, green, blue]
}
