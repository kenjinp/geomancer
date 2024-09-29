import { LatLong, remap } from "@hello-worlds/planets"
import { Region } from "../model/geology/Region"

export function createRandomImageAndDownload(): void {
  console.time("createRandomImageAndDownload")
  const canvas = document.createElement("canvas")
  canvas.id = "hex-mask"
  const size = 2048 * 2
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    console.error("Canvas context is not supported")
    return
  }

  const maxX = canvas.width
  const maxY = canvas.height
  const tempLatLong = new LatLong()

  // Create random color for each pixel
  for (let x = 0; x < maxX; x++) {
    for (let y = 0; y < maxY; y++) {
      const latitude = remap(y, 0, maxX, -90, 90)
      const longitude = remap(x, 0, maxY, -180, 180)
      tempLatLong.set(latitude, longitude)
      const id = Region.getRegionIdFromLatLong(tempLatLong)
      const color = Region.regionIdAsColor(id)
      ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  console.log("downloading")

  // Convert canvas to a data URL and trigger download
  const dataUrl = canvas.toDataURL("image/png")
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = "random_image.png"
  a.click()

  console.timeEnd("createRandomImageAndDownload")
}
