import { cellToBoundary, cellToChildren, getRes0Cells } from "h3-js";
import { useEffect, useMemo, useState } from "react";
import { Color, MathUtils, Vector3 } from "three";
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

      console.log("hex fill 2 (all cells)", h3Cells);
      const timeStart = performance.now();
      await floodFill.precomputeNeighbors(h3Cells);
      const timeEnd = performance.now();
      console.log(`hex fill 3: precompute ${timeEnd - timeStart}ms`);
      console.log("hex fill 3: precompute");

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

      console.log("hex fill 5 (result)", result);
      floodFill.destroy();

      console.log("hex fill 6 destroy");

      // Save the flood fill result so that the attribute buffer can be updated.
      setResult(result);
      return result;
    }

    floodfill().catch(console.error);
  }, [resolution]);

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

      // Create triangle fan (one cell becomes a series of triangles)
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

  // New useMemo to build an assignment attribute array based on the flood fill result.
  const floodFillAssignments = useMemo(() => {
    const cells = getAllCellsAtRes(resolution);
    const assignments: number[] = [];

    // Build a map from H3 cell to its assigned seed index.
    const assignmentMap = new Map<string, number>();
    if (result) {
      result.forEach(({ seedIndex, cells: floodCells }) => {
        floodCells.forEach((cell) => assignmentMap.set(cell, seedIndex));
      });
    }

    cells.forEach((cell) => {
      // If the cell was not reached by flood fill, assign -1.
      const assign = assignmentMap.has(cell) ? assignmentMap.get(cell)! : -1;
      const vertices = cellToBoundary(cell);
      // For each triangle (each cell's fan is composed of vertices.length triangles)
      for (let i = 0; i < vertices.length; i++) {
        // Each triangle has 3 vertices
        assignments.push(assign, assign, assign);
      }
    });

    console.log("hex fill 7 (assignments)", assignments);

    return assignments;
  }, [resolution, result]);

  const colorAssignments = useMemo(() => {
    const colors: number[] = [];
    const colorMap = new Map<number, [number, number, number]>();
    const assignmentCounts = new Map<number, number>();
    // For each vertex in the floodFillAssignments array, choose a random color.
    for (let i = 0; i < floodFillAssignments.length; i++) {
      const assignment = floodFillAssignments[i];
      if (!colorMap.has(assignment)) {
        // For unassigned cells, use red.
        if (assignment === -1) {
          colorMap.set(assignment, [0, 0, 1]);
        } else {
          const color = new Color(Math.random() * 0xffffff);

          // Otherwise, generate a random color.
          colorMap.set(assignment, [color.r, color.g, color.b]);
        }
      }
      assignmentCounts.set(
        assignment,
        (assignmentCounts.get(assignment) ?? 0) + 1
      );
      const [r, g, b] = colorMap.get(assignment)!;
      colors.push(r, g, b);
    }
    console.log("colorAssignments", colors);

    console.log("assignmentCounts", assignmentCounts);
    console.log("colorMap", colorMap);
    return colors;
  }, [floodFillAssignments]);

  return (
    <mesh key={colorAssignments.slice(0, 10).join(",")}>
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
        <bufferAttribute
          attach="attributes-color"
          count={colorAssignments.length / 3}
          array={new Float32Array(colorAssignments)}
          itemSize={3}
        />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={`
          precision highp float;
          attribute float cellId;
          attribute float floodId;
          attribute vec3 color;
          varying float vCellId;
          varying vec3 vColor;
          varying vec3 vPosition;
          varying vec4 vScreenPosition;
          
          void main() {
            vCellId = cellId;
            vColor = color;
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
