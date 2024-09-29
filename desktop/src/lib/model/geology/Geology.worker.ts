import { Geology } from "./Geology"
import { GeologyEventType, GeologyParams } from "./Geology.types"

onmessage = async (event: MessageEvent) => {
  const { command, data } = event.data
  try {
    if (command === "generate") {
      let params = data as GeologyParams
      let geology = new Geology(params)
      geology.addEventListener(GeologyEventType.Generate, payload => {
        postMessage({ event: "generating", data: payload.data })
      })
      geology.generate()
      postMessage({ event: "generated", geology: geology.serialize() })
    }
  } catch (err) {
    console.error(err)
    if (err instanceof Error) {
      postMessage({ error: err.message })
    }
  }
}
