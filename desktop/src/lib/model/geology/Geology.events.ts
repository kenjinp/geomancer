import { Event } from "eventery"
import { GeologyEventType } from "./Geology.types"

export const geologyEvents = new Event<
  [
    {
      event: GeologyEventType
      progress: number
    },
  ]
>()
