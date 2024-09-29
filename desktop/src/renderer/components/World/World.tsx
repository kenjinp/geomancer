import { EARTH_RADIUS, LatLong, remap } from "@hello-worlds/planets";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Euler,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Vector3,
} from "three";

import { Line, useTexture } from "@react-three/drei";
import React, { useMemo, useRef } from "react";
import CustomShaderMaterial from "three-custom-shader-material";
import { useSound } from "use-sound";
import { AXIAL_TILT } from "../../../lib/math/earth";
import { rotateVectorByEuler } from "../../../lib/math/rotation";
import { OrbitCamera } from "../OrbitCamera";

const origin = new Vector3();

const getAltitudeFromOrigin = (origin: Vector3, position: Vector3) => {
  return position.distanceTo(origin);
};

const PlayZoomSound: React.FC = () => {
  const [play] = useSound("/sound/small-click.mp3");
  const camera = useThree((state) => state.camera);
  const prevAltitude = useRef(0);

  useFrame(() => {
    const deltaAltitude = getAltitudeFromOrigin(origin, camera.position);
    // play the sound each time the altitude changes by 1000 meters
    if (Math.abs(deltaAltitude - prevAltitude.current) > 1000) {
      const playbackFudgeRate = 0.2;
      play({
        playbackRate: 1 + Math.random() * playbackFudgeRate,
      });
      prevAltitude.current = deltaAltitude;
    }
  });

  return null;
};

const ll = [new LatLong(0, 0), new LatLong(0, 0)];
const PlayLatLongSound: React.FC = () => {
  const [play] = useSound("/sound/big-click.mp3", { volume: 0.5 });
  const camera = useThree((state) => state.camera);
  const [prevLatLong, currentLatLong] = ll;

  useFrame(() => {
    LatLong.cartesianToLatLong(camera.position, currentLatLong);
    // play the sound each time the altitude changes by 1000 meters
    const deltaLat = Math.abs(currentLatLong.lat - prevLatLong.lat);
    const deltaLon = Math.abs(currentLatLong.lon - prevLatLong.lon);

    if (deltaLat > 5) {
      const playbackFudgeRate = Math.random() * 0.1;

      play({
        playbackRate:
          remap(Math.abs(currentLatLong.lat), 0, 90, 0.8, 1.2) +
          playbackFudgeRate,
      });
      prevLatLong.lat = currentLatLong.lat;
    }
    if (deltaLon > 5) {
      const playbackFudgeRate = Math.random() * 0.1;
      play({
        playbackRate:
          remap(Math.abs(currentLatLong.lon), 0, 180, 0.8, 1.2) +
          playbackFudgeRate,
      });
      prevLatLong.lon = currentLatLong.lon;
    }
  });

  return null;
};

const tempVector3 = new Vector3();
const World: React.FC<React.PropsWithChildren> = ({ children }) => {
  const camera = useThree((state) => state.camera);
  const [hexmask] = useTexture(["img/hexmask.png"]);
  hexmask.magFilter = NearestFilter;
  hexmask.minFilter = NearestFilter;

  const lodOrigin = useMemo(() => {
    return rotateVectorByEuler(tempVector3.copy(camera.position), AXIAL_TILT);
  }, [camera.position]);

  useFrame(() => {
    // if (planet.current) {
    //   planet.current.material.uniforms.uRegionId.value = geology.hoverId;
    // }
    rotateVectorByEuler(lodOrigin.copy(camera.position), AXIAL_TILT);
  });

  const { useShadows, lineWidth, contourWidth, subgridAlpha, contourAlpha } = {
    useShadows: false,
    lineWidth: 0.1,
    contourWidth: 100,
    subgridAlpha: 0.1,
    contourAlpha: 0.5,
  };

  return (
    <group>
      <PlayZoomSound />
      <PlayLatLongSound />
      <Line
        points={[
          new Vector3(0, EARTH_RADIUS * 1.5, 0),
          new Vector3(0, -EARTH_RADIUS * 1.5, 0),
        ]}
        lineWidth={2}
        color="blue"
      />
      <OrbitCamera planetRadius={EARTH_RADIUS} planetPosition={lodOrigin} />
      <group
        rotation={new Euler().setFromVector3(
          new Vector3(0, 0, (23.5 * Math.PI) / 180)
        )}
      >
        <Line
          name="north pole"
          points={[
            new Vector3(0, EARTH_RADIUS * 1.5, 0),
            new Vector3(0, -EARTH_RADIUS * 1.5, 0),
          ]}
          lineWidth={2}
          color="white"
        />
        <mesh>
          <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
          <CustomShaderMaterial
            vertexColors
            uniforms={{
              uCameraPosition: { value: camera.position },
              uLineWidth: { value: lineWidth },
              uContourWidth: { value: contourWidth },
              uSubgridAlpha: { value: subgridAlpha },
              uContourAlpha: { value: contourAlpha },
              uRadius: { value: EARTH_RADIUS },
              uHexmask: { value: hexmask },
              // uRegionId: { value: geology.hoverId },

              // uWhatever: {
              //   value: edges,
              // },
            }}
            color={0xffffff}
            baseMaterial={useShadows ? MeshStandardMaterial : MeshBasicMaterial}
            vertexShader={
              /* glsl */ `
            varying mat4 vModelMatrix;
            varying vec3 vPosition;
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            uniform mat4 uMatrixWorld;

            float RAD2DEG = 180.0 / 3.1415926535897932384626433832795;

            mat3 rotation3dZ(float angle) {
              float s = sin(angle);
              float c = cos(angle);

              return mat3(
                c, s, 0.0,
                -s, c, 0.0,
                0.0, 0.0, 1.0
              );
            }

            vec3 rotateZ(vec3 v, float angle) {
              return rotation3dZ(angle) * v;
            }

            vec3 rotateByEuler(vec3 point, vec3 euler) {

                float x = euler.x;
                float y = euler.y;
                float z = euler.z;

                mat3 rotationX = mat3(
                    1.0, 0.0, 0.0,
                    0.0, cos(x), -sin(x),
                    0.0, sin(x), cos(x)
                );

                mat3 rotationY = mat3(
                    cos(y), 0.0, sin(y),
                    0.0, 1.0, 0.0,
                    -sin(y), 0.0, cos(y)
                );

                mat3 rotationZ = mat3(
                    cos(z), -sin(z), 0.0,
                    sin(z), cos(z), 0.0,
                    0.0, 0.0, 1.0
                );

                // Combine rotations
                mat3 rotationMatrix = rotationX * rotationY * rotationZ;

                // Apply rotation to the point
                return rotationMatrix * point;
            }


            void main() {
              vPosition = position;
              vModelMatrix = modelMatrix; 
              vUv = uv;
              float pi = 3.1415926535897932384626433832795;
              vec3 rot = vec3(0.0, 0.0, 23.5 * pi / 180. );// (23.5 * pi) / 180.;
              vWorldPosition = rotateByEuler((vModelMatrix * vec4(vPosition, 1.0)).xyz, rot);
            }

          `
            }
            fragmentShader={
              /* glsl */ `
            varying vec3 vPosition;
            varying mat4 vModelMatrix;
            varying vec3 vWorldPosition;
            float radius = ${EARTH_RADIUS}.0;
            uniform vec3 uCameraPosition;
            uniform float uLineWidth;
            uniform float uSubgridAlpha;
            uniform float uContourAlpha;
            uniform float uContourWidth;
            uniform float uRadius;
            uniform sampler2D uHexmask;
            uniform int uRegionId;
          


            varying vec2 vUv;

            int rgbToInt(vec3 color) {
              int r = int(color.r * 255.0);
              int g = int(color.g * 255.0);
              int b = int(color.b * 255.0);
          
              return (r << 16) | (g << 8) | b;
            }

            float haversineDistance(vec3 point1, vec3 point2) {
                vec3 d = point2 - point1;
                float a = dot(d, d);
                float b = 2.0 * uRadius * sqrt(a - dot(d, normalize(point1)) * dot(d, normalize(point2)));
                return b;
            }

            float calculateClosestDistanceToLine(vec3 point, vec3 vertex1, vec3 vertex2) {
                float minDistance = 1000000.0; // A large initial value

                // Calculate distance to the line segment formed by vertex1 and vertex2
                float edgeDistance = haversineDistance(point, vertex1) + haversineDistance(point, vertex2);

                // Keep track of the minimum distance
                return min(minDistance, edgeDistance);
            }

            // float calculateClosestDistanceToEdges(vec3 point) {
            //     float minDistance = 1000000.0; // A large initial value
            //     for (int i = 0; i < edgeSize; i++) {
            //         vec3 vertex1 = uWhatever[i * 2];
            //         vec3 vertex2 = uWhatever[i * 2 + 1];
            //         float edgeDistance = calculateClosestDistanceToLine(point, vertex1, vertex2);
            //         minDistance = min(minDistance, edgeDistance);
            //     }
            //     return minDistance;
            // }


            vec3 grid(vec2 p)
            {
                return vec3(1.0)*smoothstep(0.99,1.0,max(sin((p.x)*20.0),sin((p.y)*20.0)));
            }
            
            float remap( in float value, in float x1, in float y1, in float x2, in float y2) {
              return ((value - x1) * (y2 - x2)) / (y1 - x1) + x2;
            }

            float RAD2DEG = 180.0 / 3.1415926535897932384626433832795;

            struct LatLong {
              float lat;
              float lon;
            };

            LatLong getLatLong(vec3 position, float radius) {
              // should probably use z,x for longitude, but we messed that up in the latlong class of hello worlds
              float longitude = atan(position.x, position.z) * RAD2DEG;
              float latitude = atan(-position.y, length(position.xz)) * RAD2DEG;
              return LatLong(latitude, longitude);
            }

            vec2 getLatLongUV(LatLong latLong) {
              return vec2(
                remap(latLong.lon, -180., 180., 0., 1.),
                remap(latLong.lat, -90., 90., 0., 1.)
              );
            }

            float getGrid(vec2 localPosition, float size, float thickness) {
              vec2 r = localPosition.xy / size;
              vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
              float line = min(grid.x, grid.y) + 1.0 - thickness;
              return 1.0 - min(line, 1.0);
            }

            float getGridFromFloat(float localPosition, float size, float thickness) {
              float r = localPosition / size;
              float grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
              float line = grid + 1.0 - thickness;
              return 1.0 - min(line, 1.0);
            }
            
            // float createDiscreteLineAtFloat(float localPosition, float size, float thickness) {
            //   float r = localPosition / size;
            //   float grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
            //   float line = grid + 1.0 - thickness;
            //   return 1.0 - min(line, 1.0);
            // }

            float getGridFromInt(int localPosition, float size, float thickness) {
              float r = float(localPosition);
              float grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
              float line = grid + 1.0 - thickness;
              return 1.0 - min(line, 1.0);
            }

            // float getGridFromColor(vec3 localPosition, float size, float thickness) {
            //   float r = localPosition.rgb / size;
            //   vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
            //   float line = min(grid.x, grid.y) + 1.0 - thickness;
            //   return 1.0 - min(line, 1.0);
            // }

            void main() {

              float axialTilt = 23.43616;
              vec2 arcticCircleLines = vec2(90. - axialTilt, - (90. - axialTilt));
              vec2 tropicLines = vec2(axialTilt, -axialTilt);

              vec3 wPosition = vWorldPosition;
              LatLong latlong = getLatLong(wPosition, radius);

              // float longitudeUV = remap(latlong.lon, -180., 180., 0., 1.);
              // float latitudeUV = remap(latlong.lat, -90., 90., 0., 1.);

              // vec3 color = mix(vec3(0.0, 0.0, longitudeUV), vColor.xyz, 0.5);
              // csm_DiffuseColor = vec4(color, 1.0);
              

              // int hexmask = rgbToInt(texture2D(uHexmask, vUv).rgb);
              vec3 hexmask = texture2D(uHexmask, getLatLongUV(latlong)).rgb;
              int hexId = rgbToInt(hexmask);
              bool match = hexId == uRegionId;

              float lineWidth = uLineWidth;
              float latRepititions = 18.;
              float lonRepititions = 36.;
              vec2 latlongUV = vec2(
                -remap(latlong.lat, -90., 90., 0., 1.),
                remap(latlong.lon, -180., 180., 0., 1.)
              );
              vec2 latlongUVWithReps = vec2(
                latlongUV.x * latRepititions,
                latlongUV.y * lonRepititions
              );

              // contour line stuff
              float contourWidth = uContourWidth;
              float elevationAboveDatum = length(wPosition) - radius;
              float normalizedElevationAboveDatum = elevationAboveDatum / contourWidth;
              float dh = fwidth(normalizedElevationAboveDatum);
              float contourLineWidth = lineWidth * 1.0/sqrt(1.0+dh*dh);
              float contourGrid = elevationAboveDatum > 0.0 ? getGridFromFloat(normalizedElevationAboveDatum, 1.0, contourLineWidth) : 0.0;

              vec3 color = vec3(0., 1., 0.); //vec3(253.0 / 255.0, 249.0/ 255.0, 212.0/ 255.0); //vColor.xyz; //mix(hexmask, vColor.xyz, 0.0);
              if (match) {
                color = vec3(1.0, 0.0, 0.0);
              }
              
              float hexGrid = getGridFromInt(hexId, 0.5, lineWidth);


              float grid = getGrid(latlongUVWithReps, 1.0, lineWidth);
              float grid2 = getGrid(latlongUVWithReps, 0.5, lineWidth) * uSubgridAlpha;
              float grid3 = getGrid(latlongUVWithReps, 0.1, lineWidth) * uSubgridAlpha;
              contourGrid *= uContourAlpha;
              float combinedGrid = grid + grid2 + grid3 + contourGrid;

              vec3 whiteGridColors = mix(color, vec3(1.0), combinedGrid);

              float primeMeridian = getGridFromFloat(latlongUV.y, 0.5, lineWidth * 2.0);
              float equator = getGridFromFloat(latlongUV.x, 0.5, lineWidth * 2.0);
              float tropicCapricorn = getGridFromFloat(latlongUV.x + remap(tropicLines.x, -90., 90., 0., 1.), 1.0, lineWidth * 2.0);
              float tropicCancer = getGridFromFloat(latlongUV.x + remap(tropicLines.y, -90., 90., 0., 1.), 1.0, lineWidth * 2.0);
              float arcticCircle = getGridFromFloat(latlongUV.x + remap(arcticCircleLines.x, -90., 90., 0., 1.), 1.0 , lineWidth * 2.0);
              float antarcticCircle = getGridFromFloat(latlongUV.x + remap(arcticCircleLines.y, -90., 90., 0., 1.), 1.0, lineWidth * 2.0);
              float combinedGrid2 = primeMeridian + equator;
              float tropics = tropicCapricorn + tropicCancer;
              float polarCircles = arcticCircle + antarcticCircle;

              vec3 combinedGridColors = mix(whiteGridColors, vec3(1.0, 0.0, 0.0), combinedGrid2);
              combinedGridColors = mix(combinedGridColors, vec3(0.0, 1.0, 0.0), tropics);
              combinedGridColors = mix(combinedGridColors, vec3(0.0, 0.0, 1.0), polarCircles);

              if (polarCircles > 0.0) {
                combinedGridColors = vec3(0.0, 0.0, 1.0);
              }

              if (tropics > 0.0) {
                combinedGridColors = vec3(1.0, 0.0, 0.0);
              }

              if (combinedGrid2 > 0.0) {
                combinedGridColors = vec3(0.0, 0.0, 0.0);
              }         

              csm_DiffuseColor = vec4(combinedGridColors, 1.0);
            }
          `
            }
          />
          {children}
        </mesh>
      </group>
    </group>
  );
};

export default World;
