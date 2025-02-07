import { cellToBoundary, cellToChildren, getRes0Cells } from "h3-js";
import { useMemo } from "react";
import { MathUtils, Vector3 } from "three";

function getAllCellsAtRes(res) {
  return res === 0
    ? getRes0Cells()
    : getRes0Cells().flatMap((base) => cellToChildren(base, res));
}

export function H3Geometry({ resolution = 5, radius = 1 }) {
  const [positions, cellIndices] = useMemo(() => {
    const positions = [];
    const cellIndices = [];
    const cells = getAllCellsAtRes(resolution);

    cells.forEach((cell, cellIndex) => {
      const vertices = cellToBoundary(cell).map(([lat, lng]) => {
        const theta = MathUtils.degToRad(lng);
        const phi = MathUtils.degToRad(90 - lat);
        return new Vector3().setFromSphericalCoords(radius, phi, theta);
      });

      // Create triangle fan
      for (let i = 0; i < vertices.length; i++) {
        positions.push(
          ...vertices[0].toArray(), // Center
          ...vertices[i].toArray(),
          ...vertices[(i + 1) % vertices.length].toArray()
        );
        cellIndices.push(cellIndex, cellIndex, cellIndex);
      }
    });

    return [positions, cellIndices];
  }, [resolution, radius]);

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={new Float32Array(positions)}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-cellId"
          count={cellIndices.length}
          array={new Uint16Array(cellIndices)}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={`
          attribute float cellId;
          varying float vCellId;
          varying vec3 vPosition;
          varying vec4 vScreenPosition;
          
          void main() {
            vCellId = cellId;
            vPosition = position;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            vScreenPosition = gl_Position;
          }
        `}
        fragmentShader={`
          varying float vCellId;
          varying vec3 vPosition;
          varying vec4 vScreenPosition;

          const float PI = 3.14159265359;
          const vec3 gridColor = vec3(0.0);
          const vec3 specialLineColor = vec3(0.8, 0.2, 0.2);
          
          float hash(float n) {
            return fract(sin(n) * 43758.5453123);
          }

          float getLatitude(vec3 p) {
            return asin(p.y / length(p)) * 180.0 / PI;
          }
          
          float getLongitude(vec3 p) {
            return atan(p.z, p.x) * 180.0 / PI;
          }

          float getLineWidth(float value, float pixelWidth) {
            vec2 screenDerivatives = fwidth(vec2(value, 0.0));
            float screenWidth = screenDerivatives.x * pixelWidth;
            return 1.0 - smoothstep(0.0, screenWidth, abs(value));
          }

          void main() {
            // Base hex color
            float r = hash(vCellId);
            float g = hash(vCellId + 1.0);
            float b = hash(vCellId + 2.0);
            vec3 hexColor = vec3(r, g, b);

            float lat = getLatitude(vPosition);
            float lon = getLongitude(vPosition);
            
            // Grid line detection (every 15 degrees)
            float latGrid = abs(mod(abs(lat) + 7.5, 15.0) - 7.5);
            float lonGrid = abs(mod(abs(lon) + 7.5, 15.0) - 7.5);
            
            // Special latitudes
            float equator = abs(lat);
            float tropicN = abs(lat - 23.5);
            float tropicS = abs(lat + 23.5);
            
            // Calculate line intensities with anti-aliasing
            float latGridLine = getLineWidth(latGrid, 1.0);
            float lonGridLine = getLineWidth(lonGrid, 1.0);
            float equatorLine = getLineWidth(equator, 1.0);
            float tropicNLine = getLineWidth(tropicN, 1.0);
            float tropicSLine = getLineWidth(tropicS, 1.0);
            
            // Combine all line intensities
            float gridIntensity = max(latGridLine, lonGridLine);
            float specialIntensity = max(max(equatorLine, tropicNLine), tropicSLine);
            
            // First apply special lines, then regular grid lines
            vec3 color = hexColor;
            if (specialIntensity > 0.0) {
                color = mix(color, specialLineColor, specialIntensity);
            }
            if (gridIntensity > 0.0) {
                color = mix(color, gridColor, gridIntensity);
            }
            
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}
