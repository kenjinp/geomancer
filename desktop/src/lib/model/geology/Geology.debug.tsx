import { LatLong, remap } from "@hello-worlds/planets";
import { Billboard, Line, Text } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import { useControls } from "leva";
import { useMemo, useState } from "react";
import {
  Color,
  ColorRepresentation,
  DynamicDrawUsage,
  MathUtils,
  Vector3,
} from "three";
import { UI } from "../../../../tunnel";
import { AXIAL_TILT } from "../../../../../lib/math/earth";
import { rotateVectorByEuler } from "../../../../../lib/math/rotation";
import { useGeology } from "./Geology.provider";
import { CollisionType } from "./Geology.types";
import { Region } from "./Region";
import {
  PlateBoundary,
  PlateBoundaryEdge,
} from "./plate-boundaries/PlateBoundary";

const tempLatLong = new LatLong();

const PlateBoundaryContiguousEdges: React.FC<
  React.PropsWithChildren<{
    edges: PlateBoundaryEdge[];
    color: ColorRepresentation;
  }>
> = ({ edges, color, children }) => {
  const { geology } = useGeology();
  const { points, vertexColors } = useMemo(() => {
    const points: Vector3[] = [];
    const vertexColors: Color[] = [];
    edges.forEach((e) => {
      const pressure = Math.max(
        -1,
        Math.min((e.forceA.pressure + e.forceB.pressure) / 2, 1)
      );
      const pressureColorA =
        e.forceA.pressure <= 0
          ? new Color(1 + pressure, 1, 0)
          : new Color(1, 1 - pressure, 0);
      const pressureColorB =
        e.forceB.pressure <= 0
          ? new Color(1 + pressure, 1, 0)
          : new Color(1, 1 - pressure, 0);
      points.push(
        new Vector3(e.cartA.x, e.cartA.y, e.cartA.z)
          .normalize()
          .multiplyScalar(geology.params.radius * 1.001),
        new Vector3(e.cartB.x, e.cartB.y, e.cartB.z)
          .normalize()
          .multiplyScalar(geology.params.radius * 1.001)
      );

      const typeA = e.forceA.collisionType;
      const typeB = e.forceB.collisionType;

      const getColor = (type: CollisionType) => {
        if (type === CollisionType.Convergent) {
          return new Color(1, 0, 0);
        }
        if (type === CollisionType.Divergent) {
          return new Color(0, 1, 0);
        }
        if (type === CollisionType.Transform) {
          return new Color(0, 0, 1);
        }
        return new Color(1, 1, 1);
      };

      // vertexColors.push(pressureColorA, pressureColorB)
      vertexColors.push(getColor(typeA), getColor(typeB));
      // vertexColors.push(new Color(1, 0, 0), new Color(0, 0, 1))
    });
    return { points, vertexColors };
  }, [edges]);

  return (
    <>
      <Billboard
        position={points[0]
          .clone()
          .normalize()
          .multiplyScalar(geology.params.radius * 1.05)}
      >
        <Text
          color={"black"}
          anchorX="center"
          anchorY="middle"
          fontSize={72}
          outlineWidth={4}
          outlineColor="black"
          scale={1_000}
        >
          Edge Start {edges[0].id}
        </Text>
      </Billboard>
      <Line
        points={points}
        lineWidth={2}
        vertexColors={vertexColors}
        color={color}
      >
        {children}
      </Line>
    </>
  );
};

const PlateBoundary: React.FC<{ plateBoundary: PlateBoundary }> = ({
  plateBoundary,
}) => {
  const { generated } = useGeology();

  const sortedContiguousEdges = useMemo(() => {
    return Array.from(plateBoundary.sortedContiguousEdges.values());
  }, [plateBoundary, generated]);

  return sortedContiguousEdges.map((edges, index) => {
    const small = edges.length === 1;

    return (
      <PlateBoundaryContiguousEdges
        key={index}
        edges={Array.from(edges.values()).map(
          (id) => plateBoundary.edges.get(id)!
        )}
        color={small ? "black" : "white"}
      />
    );
  });
};

const Danglers: React.FC<{ plateBoundary: PlateBoundary }> = ({
  plateBoundary,
}) => {
  const { geology } = useGeology();

  return plateBoundary.danglers.map((id, index) => {
    const e = plateBoundary.edges.get(id)!;

    console.log({
      dangler: e,
      plateBoundary,
    });

    return (
      <mesh key={id}>
        <Line
          points={[
            new Vector3(e.cartA.x, e.cartA.y, e.cartA.z)
              .normalize()
              .multiplyScalar(geology.params.radius * 1.001),
            new Vector3(e.cartB.x, e.cartB.y, e.cartB.z)
              .normalize()
              .multiplyScalar(geology.params.radius * 1.001),
          ]}
          color="black"
          lineWidth={10}
        />
        <Billboard
          position={new Vector3(e.cartA.x, e.cartA.y, e.cartA.z)
            .normalize()
            .multiplyScalar(geology.params.radius * 1.001)}
        >
          <Text
            color={"black"}
            anchorX="center"
            anchorY="middle"
            fontSize={72}
            outlineWidth={4}
            outlineColor="black"
            scale={1_000}
          >
            {e.id}
          </Text>
        </Billboard>
      </mesh>
    );
  });
};

const PlateBoundaries: React.FC = () => {
  const { geology } = useGeology();

  return Array.from(geology.plateBoundaries.values()).map((pb) => {
    return (
      <>
        <PlateBoundary
          key={Array.from(pb.plates.values())
            .map((p) => p.id)
            .sort()
            .join("-")}
          plateBoundary={pb}
        />
      </>
    );
  });
};

const InstancedTectonicMovementIndicator: React.FC = () => {
  const { geology, generated } = useGeology();

  const { positions, colors } = useMemo(() => {
    const pos: number[] = [];
    const colors: number[] = [];
    Array.from(geology.regions.values()).forEach((region) => {
      const positionLatLong = region.getCenterCoordinates();

      const plate = region.plate!;

      const position = positionLatLong.toCartesian(
        geology.params.radius * 1.01,
        new Vector3()
      );

      const sitePosition = positionLatLong.toCartesian(
        geology.params.radius * 1,
        new Vector3()
      );

      const movement = plate.calculateMovement(position, geology.params.radius);

      const color = new Color(MathUtils.seededRandom(plate.id) * 0xffffff);

      const normal = sitePosition.clone().normalize();

      const baseWidth = 50_000;
      const sideOffset = movement
        .clone()
        .cross(normal)
        .setLength(baseWidth / 2);

      pos.push(
        ...[
          ...position.clone().add(sideOffset).toArray(),
          ...position.clone().add(movement).toArray(),
          ...position.clone().sub(sideOffset).toArray(),
        ]
      );
      colors.push(
        ...[...color.toArray(), ...color.toArray(), ...color.toArray()]
      );
    });
    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(colors),
    };
  }, [geology, generated]);

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute
          needsUpdate={true}
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          usage={DynamicDrawUsage}
        />
        <bufferAttribute
          needsUpdate={true}
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
          usage={DynamicDrawUsage}
        />
      </bufferGeometry>
      <meshBasicMaterial vertexColors></meshBasicMaterial>
    </mesh>
  );
};

const Hotspots: React.FC = () => {
  const { geology, generated } = useGeology();

  const hotspots = useMemo(() => {
    return geology.hotspots.map((h, index) => {
      const position = h.coordinates.toCartesian(
        geology.params.radius,
        new Vector3()
      );
      const sitePosition = h.coordinates.toCartesian(
        geology.params.radius * 1.1,
        new Vector3()
      );
      const size = remap(h.magnitude, 0, 1, 5_000, 300_000);
      const name = `hotspot-${index}`;
      const color = h.color;
      return (
        <group key={`hotspot-:${index}`}>
          {h.children.map((child, i) => {
            const position = child.coordinates.toCartesian(
              geology.params.radius,
              new Vector3()
            );
            const sitePosition = child.coordinates.toCartesian(
              geology.params.radius * 1.04,
              new Vector3()
            );
            const size = remap(child.magnitude, 0, 1, 5_000, 300_000);
            const name = `hotspot-:${index}:${i}`;
            return (
              <group key={name}>
                <mesh>
                  <Line
                    points={[position, sitePosition]}
                    color="white"
                    transparent
                    dashSize={5_000}
                    opacity={0.3}
                    lineWidth={4}
                  ></Line>
                </mesh>
                <Billboard position={sitePosition}>
                  <Text
                    color={color}
                    anchorX="center"
                    anchorY="middle"
                    fontSize={72}
                    outlineWidth={4}
                    outlineColor="black"
                    scale={1_000}
                  >
                    {name}
                  </Text>
                </Billboard>
                <mesh position={position}>
                  <sphereGeometry args={[size, 16, 16]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              </group>
            );
          })}
          <mesh>
            <Line
              points={[position, sitePosition]}
              color="white"
              transparent
              dashSize={5_000}
              opacity={0.3}
              lineWidth={4}
            ></Line>
          </mesh>
          <Billboard position={sitePosition}>
            <Text
              color={color}
              anchorX="center"
              anchorY="middle"
              fontSize={72}
              outlineWidth={4}
              outlineColor="black"
              scale={2_000}
            >
              {name}
            </Text>
          </Billboard>
          <mesh position={position}>
            <sphereGeometry args={[size, 32, 32]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      );
    });
  }, [geology.id]);

  return hotspots;
};

export const GeologyDebug: React.FC = () => {
  const { geology } = useGeology();
  const [hovering, setHover] = useState(false);
  const { showHotspots, showTectonicMovement, showPlateBoundaries } =
    useControls({
      showHotspots: false,
      showTectonicMovement: false,
      showPlateBoundaries: false,
    });

  const handleDebugHover = (e: ThreeEvent<PointerEvent>) => {
    const point = e.point;
    rotateVectorByEuler(point, AXIAL_TILT);

    const latLong = LatLong.cartesianToLatLong(point, tempLatLong);
    const region = geology.getRegionFromVector(point);

    if (region) {
      geology.hoverId = Region.getRegionIdAsInt(region?.id);
    }

    const plate = geology.getPlateFromVector(point);
    const regionDebugDisplay = document.getElementById("debug-region");
    const neighborPlates = Array.from(plate?.neighboringPlates || [])
      .map((neighborPlate) => neighborPlate.id)
      .join(", ");

    if (regionDebugDisplay) {
      regionDebugDisplay.style.top = `${e.clientY}px`;
      regionDebugDisplay.style.left = `${e.clientX}px`;
      if (region) {
        regionDebugDisplay.innerHTML = `
        <div>
        <p>${latLong.lat.toFixed(4)}°, ${latLong.lon.toFixed(4)}°</p>
        <p>
            Region: ${region.id}
          </p>
          <p>
            Plate: ${region.plate?.id} ${plate?.plateType.toLocaleLowerCase()}
          </p>
          <p>
            Plate Neighbors: ${neighborPlates}
          </p>
          <p>
          <p>
           Crust Type: ${region.type}
          </p>
          <p>
           Normalized Elevation: ${region.elevation}
          </p>
        </div>
        `;
      } else {
        regionDebugDisplay.innerHTML = `
        <div>
        <p>${latLong.lat.toFixed(4)}°, ${latLong.lon.toFixed(4)}°</p>
         <p>
            Region: None
          </p>
        </div>
        `;
      }
    }
  };

  return (
    <group key={geology.id}>
      <mesh
        visible={false}
        onPointerMove={handleDebugHover}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
      >
        <sphereGeometry args={[geology.params.radius, 32, 32]} />
        <meshBasicMaterial wireframe />
      </mesh>
      {hovering && (
        <UI.In>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              background: "rgba(0,0,0,0.25)",
              padding: "1em",
              backdropFilter: "blur(10px)",
            }}
            id="debug-region"
          ></div>
        </UI.In>
      )}

      {showTectonicMovement && (
        <InstancedTectonicMovementIndicator key={`arrows-${geology.id}`} />
      )}

      {showPlateBoundaries && <PlateBoundaries />}

      {showHotspots && <Hotspots />}

      {Array.from(geology.plates.values()).map((plate) => {
        const positionLatLong = plate.initialRegion.getCenterCoordinates();

        const position = positionLatLong.toCartesian(
          geology.params.radius * 1.2,
          new Vector3()
        );

        const sitePosition = positionLatLong.toCartesian(
          geology.params.radius * 1,
          new Vector3()
        );

        const color = new Color(MathUtils.seededRandom(plate.id) * 0xffffff);

        return (
          <group key={plate.id}>
            <mesh>
              <Line
                points={[position, sitePosition]}
                color="white"
                transparent
                dashSize={5_000}
                opacity={0.3}
                lineWidth={4}
              ></Line>
            </mesh>
            <Billboard position={position}>
              <Text
                color={color}
                anchorX="center"
                anchorY="middle"
                fontSize={72}
                outlineWidth={4}
                outlineColor="black"
                scale={5_000}
              >
                Plate {plate.id} ({plate.plateType.toLocaleLowerCase()})
              </Text>
            </Billboard>
          </group>
        );
      })}
    </group>
  );
};
