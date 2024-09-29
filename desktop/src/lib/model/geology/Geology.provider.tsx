import * as React from "react"
import { Geology } from "./Geology"
import { geologyEvents } from "./Geology.events"
import { GeologyParams, IGeology } from "./Geology.types"
import GeologyWorker from "./Geology.worker?worker"

const worker = () => new GeologyWorker()

export const GeologyContext = React.createContext<{
  geology: IGeology
  generated: boolean
}>(null!)

export const useGeology = () => {
  return React.useContext(GeologyContext)
}

export const GeologyProvider: React.FC<
  React.PropsWithChildren<GeologyParams>
> = ({ children, ...params }) => {
  const [workerInstance] = React.useState(() => worker())
  const [geology, setGeology] = React.useState<IGeology>(new Geology())
  const [generated, setGenerated] = React.useState(false)

  React.useEffect(() => {
    workerInstance.addEventListener("message", event => {
      if (event.data.event === "generated") {
        setGeology(new Geology().copy(event.data.geology))
        setGenerated(true)
      }
      if (event.data.event === "generating") {
        geologyEvents.emit(event.data)
      }
    })

    workerInstance.addEventListener("error", event => {
      console.error(event)
    })
  }, [workerInstance])

  React.useMemo(() => {
    workerInstance.postMessage({
      command: "generate",
      data: params,
    })
    setGenerated(false)
  }, [JSON.stringify(params), workerInstance])

  return (
    <GeologyContext.Provider
      value={{
        geology,
        generated,
      }}
    >
      {children}
    </GeologyContext.Provider>
  )
}
