import { cn } from "@/lib/ui/utilts";
import store, { MapLayer, MapMode, setState } from "@/state/Context";
import { Button, ButtonGroup } from "@nextui-org/react";
import { useStore } from "zustand";

export const MapModeBar: React.FC = () => {
  const mapMode = useStore(store).mapMode;
  const mapLayers = useStore(store).mapLayers;
  const mapModeButtons = [
    // {
    //   label: "Realistic",
    //   onClick: () => {
    //     setState({
    //       mapMode: MapMode.REALISTIC
    //     })
    //   }
    // },
    {
      label: "Elevation",
      mapMode: MapMode.ELEVATION,
    },
    {
      label: "Tectonic Plates",
      mapMode: MapMode.PLATES,
    },
    {
      label: "Hex Grid",
      mapMode: MapMode.HEXGRID,
    },
    {
      label: "Chunks",
      mapMode: MapMode.CHUNKS,
    },
  ];

  const mapLayerButtons = [
    {
      label: "HexGrid",
      mapLayer: MapLayer.HEXGRID,
    },
    {
      label: "LatLong",
      mapLayer: MapLayer.LATLONG,
    },
    {
      label: "Realistic Lighting",
      mapLayer: MapLayer.REALISTIC_LIGHTING,
    },
    {
      label: "Chunks",
      mapLayer: MapLayer.CHUNKS,
    },
    // {
    //   label: "Atmosphere",
    //   mapLayer: MapLayer.ATMOSPHERE,
    // },
    // {
    //   label: "Plate Boundaries",
    //   mapLayer: MapLayer.PLATE_BOUNDARIES,
    // },
  ];

  return (
    <div className="absolute flex flex-row justify-between w-full top-0 left-0 p-2 pr-20">
      <div>
        <div>
          <ButtonGroup>
            {mapModeButtons.map((button) => {
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn({
                    "bg-background": mapMode === button.mapMode,
                  })}
                  onPress={() => {
                    setState({
                      mapMode: button.mapMode,
                    });
                  }}
                >
                  {button.label}
                </Button>
              );
            })}
          </ButtonGroup>
        </div>
      </div>
      <div>
        <div className="flex flex-row gap-2">
          {mapLayerButtons.map((button) => {
            return (
              <Button
                variant="bordered"
                size="sm"
                className={cn({
                  "bg-background": mapLayers.includes(button.mapLayer),
                })}
                onPress={() => {
                  if (mapLayers.includes(button.mapLayer)) {
                    setState({
                      mapLayers: mapLayers.filter((l) => l !== button.mapLayer),
                    });
                  } else {
                    setState({
                      mapLayers: Array.from(
                        new Set([...mapLayers, button.mapLayer])
                      ),
                    });
                  }
                }}
              >
                {button.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
