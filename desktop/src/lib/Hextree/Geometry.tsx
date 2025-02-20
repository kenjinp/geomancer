import { cellToBoundary, cellToChildren, getRes0Cells } from "h3-js";
import { useEffect, useMemo, useState } from "react";
import { FloodFillResult, HexGridFloodFill } from "./FloodFill";

function getAllCellsAtRes(res) {
  return res === 0
    ? getRes0Cells()
    : getRes0Cells().flatMap((base) => cellToChildren(base, res));
}

export function H3Geometry({ resolution = 3, radius = 1, seedCount = 4 }) {
  const [result, setResult] = useState<FloodFillResult | null>(null);

  if (resolution > 4) {
    throw new Error("Resolution must be 0-4");
  }

  useEffect(() => {
    async function floodfill() {
      const targetResolution = resolution;
      // Create a configuration for H3 resolution "resolution" with up to 50 seeds
      const config = HexGridFloodFill.configFromResolutionDynamic(
        targetResolution,
        seedCount + 1
      );

      console.log("hex fill 1", config);
      const floodFill = await HexGridFloodFill.create(config);

      // Now get all H3 cells at the same resolution
      const h3Cells: string[] = HexGridFloodFill.getAllH3Cells(resolution);

      // TODO somehow prebake this, maybe as a texture
      console.log("hex fill 2 (all cells)", h3Cells);
      const timeStart = performance.now();
      await floodFill.precomputeNeighbors(h3Cells);
      const timeEnd = performance.now();
      console.log(`hex fill 3: precompute ${timeEnd - timeStart}ms`);

      // choose random cells
      const seedCells: string[] = [];
      const pickedIndices = new Set<number>();
      while (seedCells.length < seedCount) {
        const randomIndex = Math.floor(Math.random() * h3Cells.length);
        if (!pickedIndices.has(randomIndex)) {
          pickedIndices.add(randomIndex);
          seedCells.push(h3Cells[randomIndex]);
        }
      }

      console.log("hex fill 4 (seedCells)", seedCells);
      const timeStart2 = performance.now();
      const result = await floodFill.fill(seedCells);
      const timeEnd2 = performance.now();
      console.log(`hex fill 5: fill ${timeEnd2 - timeStart2}ms`);

      floodFill.destroy();
      console.log("hex fill 6 destroy");

      // Save the flood fill result so that the attribute buffer can be updated.
      setResult(result);
      return result;
    }

    floodfill().catch(console.error);
  }, [resolution]);

  const { positions, cellIndices, floodFillAssignments } = useMemo(() => {
    const cells = getAllCellsAtRes(resolution);
    const numCells = cells.length;

    const positions: number[] = [];
    const cellIndices: number[] = [];
    const floodFillAssignments: number[] = [];

    // Build a map from H3 cell to its assigned seed index if flood fill has run.
    const assignmentMapTimeStart = performance.now();
    const assignmentMap = new Map<string, number>();
    if (result) {
      result.forEach(({ seedIndex, cells: floodCells }) => {
        floodCells.forEach((cell) => assignmentMap.set(cell, seedIndex));
      });
      const assignmentMapTimeEnd = performance.now();
      console.log(
        `useMemo: assignmentMap ${
          assignmentMapTimeEnd - assignmentMapTimeStart
        }ms`
      );
    }

    // Optimized loop for computing vertices, cellIndices, and floodFillAssignments.

    const degToRad = Math.PI / 180;

    const computeVerticesTimeStart = performance.now();
    for (let cellIndex = 0; cellIndex < numCells; cellIndex++) {
      const cell = cells[cellIndex];

      // Get the boundary coordinates (lat, lng) for the cell.
      const boundary = cellToBoundary(cell); // e.g., [ [lat, lng], ... ]
      const numVertices = boundary.length;
      const vertices = new Array<number[]>(numVertices);

      // Compute vertices directly from spherical coordinates.
      // Converting: theta = lng in radians; phi = (90 - lat) in radians.
      for (let i = 0; i < numVertices; i++) {
        const [lat, lng] = boundary[i];
        const theta = lng * degToRad;
        const phi = (90 - lat) * degToRad;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        // These formulas replicate THREE's spherical conversion:
        // x = r*sin(phi)*cos(theta), y = r*sin(phi)*sin(theta), z = r*cos(phi)
        vertices[i] = [
          radius * sinPhi * Math.cos(theta),
          radius * sinPhi * Math.sin(theta),
          radius * cosPhi,
        ];
      }

      // Determine the flood fill assignment (-1 if not reached).
      const assign = assignmentMap.has(cell) ? assignmentMap.get(cell)! : -1;

      // Create the triangle fan for the cell.
      for (let i = 0; i < numVertices; i++) {
        // Each cell is drawn as a fan: center, vertex[i], vertex[(i+1) % numVertices]
        positions.push(
          ...vertices[0], // Center vertex
          ...vertices[i], // Current vertex
          ...vertices[(i + 1) % numVertices] // Next vertex (wraps around)
        );
        // Push the cell index for each vertex
        cellIndices.push(cellIndex, cellIndex, cellIndex);
        // Each triangle's vertices take the same flood fill assignment.
        floodFillAssignments.push(assign, assign, assign);
      }
    }
    const computeVerticesTimeEnd = performance.now();
    console.log(
      `useMemo:  computeVertices ${
        computeVerticesTimeEnd - computeVerticesTimeStart
      }ms`
    );
    return { positions, cellIndices, floodFillAssignments };
  }, [resolution, radius, result]);

  return (
    <mesh key={floodFillAssignments.slice(0, 10).join(",")}>
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
        <bufferAttribute
          attach="attributes-floodId"
          count={floodFillAssignments.length}
          array={new Uint16Array(floodFillAssignments)}
          itemSize={1}
          normalized={false}
        />
        {/* <bufferAttribute
          attach="attributes-color"
          count={colorAssignments.length / 3}
          array={new Float32Array(colorAssignments)}
          itemSize={3}
        /> */}
      </bufferGeometry>
      <shaderMaterial
        vertexShader={`
          precision highp float;
          attribute float cellId;
          attribute float floodId;
          varying float vCellId;
          varying vec3 vColor;
          varying vec3 vPosition;
          varying vec4 vScreenPosition;

          float hash(float n) {
            return fract(sin(n) * 43758.5453);
          }

          vec3 color(float n) {
            return vec3(hash(n), hash(n + 1.0), hash(n + 2.0));
          }
          
          void main() {
            vCellId = cellId;
            vColor = color(floodId);
            vPosition = position;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            vScreenPosition = gl_Position;
          }
        `}
        fragmentShader={`
          precision highp float;
          varying vec3 vColor;
          varying vec3 vPosition;
          varying vec4 vScreenPosition;
          
          void main() {
            gl_FragColor = vec4(vColor, 1.0);
          }
        `}
      />
    </mesh>
  );
}
