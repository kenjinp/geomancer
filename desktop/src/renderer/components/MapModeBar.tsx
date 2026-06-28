import { Button, ButtonGroup } from "@nextui-org/react";
import { useStore } from "zustand";

import { cn } from "@/lib/ui/utilts";
import store, {
  CameraMode,
  MapLayer,
  MapMode,
  WorldMode,
  setState,
} from "@/state/Context";

import { SeedInput } from "./SeedInput";

export const MapModeBar: React.FC = () => {
  const mapMode = useStore(store).mapMode;
  const mapLayers = useStore(store).mapLayers;
  const cameraMode = useStore(store).cameraMode;
  const worldMode = useStore(store).worldMode;
  const worldModeButtons = [
    {
      label: "Sphere",
      worldMode: WorldMode.SPHERE,
    },
    {
      label: "Torus",
      worldMode: WorldMode.TORUS,
    },
  ];
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
    {
      label: "Sphere Projection",
      mapLayer: MapLayer.SPHERE_PROJECTION,
    },
    {
      label: "Interpolation",
      mapLayer: MapLayer.INTERPOLATION,
    },
    {
      label: "Coastalness",
      mapLayer: MapLayer.COASTALNESS,
    },
    {
      label: "Atmosphere",
      mapLayer: MapLayer.ATMOSPHERE,
    },
    // {
    //   label: "Plate Boundaries",
    //   mapLayer: MapLayer.PLATE_BOUNDARIES,
    // },
  ];

  return (
    <div className="absolute flex flex-row justify-between w-full top-0 left-0 p-2 pr-20">
      <div>
        <div className="mb-2">
          <ButtonGroup>
            {worldModeButtons.map((button) => {
              return (
                <Button
                  key={button.worldMode}
                  variant="ghost"
                  size="sm"
                  className={cn({
                    "bg-background": worldMode === button.worldMode,
                  })}
                  onPress={() => {
                    setState({
                      worldMode: button.worldMode,
                    });
                  }}
                >
                  {button.label}
                </Button>
              );
            })}
          </ButtonGroup>
        </div>
        <div>
          <ButtonGroup>
            {mapModeButtons.map((button) => {
              return (
                <Button
                  key={button.mapMode}
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
        <div className="mt-2">
          <SeedInput />
        </div>
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="bg-background"
            onPress={() => {
              const order = [
                CameraMode.ORBIT,
                CameraMode.FLY,
                CameraMode.CHARACTER,
              ];
              const next = order[(order.indexOf(cameraMode) + 1) % order.length];
              setState({ cameraMode: next });
            }}
          >
            {cameraMode === CameraMode.ORBIT
              ? "Orbit Camera"
              : cameraMode === CameraMode.FLY
                ? "Fly Camera"
                : "Character"}
          </Button>
        </div>
      </div>
      <div>
        <div className="flex flex-row gap-2">
          {mapLayerButtons.map((button) => {
            return (
              <Button
                key={button.mapLayer}
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
                      mapLayers: Array.from(new Set([...mapLayers, button.mapLayer])),
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
