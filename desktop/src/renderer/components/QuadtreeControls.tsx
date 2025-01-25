import React, { useState } from "react";
import { useQuadtree, useQuadtreeControls } from "./QuadtreeContext";

export const QuadtreeControls: React.FC = () => {
  const { stats } = useQuadtree();
  const { initializeQuadtree, reset, generateRandomPoints } =
    useQuadtreeControls();
  const [pointCount, setPointCount] = useState(100);
  const [radius, setRadius] = useState(100);

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Quadtree Controls</h3>

      <div className="space-y-4">
        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Initialize New Quadtree</label>
          <button
            onClick={() =>
              initializeQuadtree({
                size: 100,
                minNodeSize: 1,
                comparatorValue: 1.5,
              })
            }
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Initialize
          </button>
        </div>

        <div className="flex flex-col space-y-2">
          <label className="text-sm font-medium">Generate Random Points</label>
          <div className="flex space-x-2">
            <input
              type="number"
              value={pointCount}
              onChange={(e) => setPointCount(Number(e.target.value))}
              className="px-2 py-1 border rounded w-24"
              min="1"
            />
            <input
              type="number"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="px-2 py-1 border rounded w-24"
              min="1"
            />
            <button
              onClick={() => generateRandomPoints(pointCount, radius)}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Generate
            </button>
          </div>
        </div>

        <div>
          <button
            onClick={reset}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded">
          <h4 className="font-medium mb-2">Statistics</h4>
          <div className="space-y-1 text-sm">
            <p>Total Nodes: {stats.totalNodes}</p>
            <p>Max Depth: {stats.maxDepth}</p>
            <div className="grid grid-cols-2 gap-2">
              {stats.nodesPerFace.map((count, i) => (
                <p key={i}>
                  Face {i}: {count} nodes
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
