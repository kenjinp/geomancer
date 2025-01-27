import { CubicQuadtree } from "@/lib/Quadtree/CubicQuadtree";
import React, { createContext, useCallback, useContext, useState } from "react";
import * as THREE from "three";

interface QuadtreeContextType {
  quadtree: CubicQuadtree | null;
  initializeQuadtree: (params: QuadtreeParams) => void;
  insertPoint: (point: THREE.Vector3) => void;
  reset: () => void;
  stats: QuadtreeStats;
}

interface QuadtreeParams {
  origin?: THREE.Vector3;
  size: number;
  minNodeSize: number;
  comparatorValue: number;
}

interface QuadtreeStats {
  totalNodes: number;
  nodesPerFace: number[];
  maxDepth: number;
}

const defaultParams: QuadtreeParams = {
  origin: new THREE.Vector3(0, 0, 0),
  size: 100,
  minNodeSize: 1,
  comparatorValue: 1.5,
};

const QuadtreeContext = createContext<QuadtreeContextType | null>(null);

export const QuadtreeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [quadtree, setQuadtree] = useState<CubicQuadtree | null>(null);
  const [stats, setStats] = useState<QuadtreeStats>({
    totalNodes: 0,
    nodesPerFace: [0, 0, 0, 0, 0, 0],
    maxDepth: 0,
  });

  const updateStats = useCallback((qt: CubicQuadtree) => {
    const faces = qt.getFaces();
    const nodesPerFace = faces.map((face) => face.nodeBuffer.size);
    const totalNodes = qt.unifiedBuffer.intBuffer.length;

    // Calculate max depth by checking the level statistics of each face
    const maxDepth = Math.max(
      ...faces.map((face) => {
        const levelStats = face.getNodeLevelStatistics();
        return levelStats.length > 0
          ? levelStats[levelStats.length - 1].level
          : 0;
      })
    );

    setStats({
      totalNodes,
      nodesPerFace,
      maxDepth,
    });
  }, []);

  const initializeQuadtree = useCallback(
    (params: QuadtreeParams = defaultParams) => {
      const newQuadtree = new CubicQuadtree({
        origin: params.origin || defaultParams.origin,
        size: params.size,
        minNodeSize: params.minNodeSize,
        comparatorValue: params.comparatorValue,
      });

      setQuadtree(newQuadtree);
      updateStats(newQuadtree);
    },
    [updateStats]
  );

  const insertPoint = useCallback(
    (point: THREE.Vector3) => {
      if (!quadtree) return;

      quadtree.insert(point);
      updateStats(quadtree);
    },
    [quadtree, updateStats]
  );

  const reset = useCallback(() => {
    if (!quadtree) return;

    quadtree.reset();
    updateStats(quadtree);
  }, [quadtree, updateStats]);

  return (
    <QuadtreeContext.Provider
      value={{
        quadtree,
        initializeQuadtree,
        insertPoint,
        reset,
        stats,
      }}
    >
      {children}
    </QuadtreeContext.Provider>
  );
};

// Custom hook to use the Quadtree context
export const useQuadtree = () => {
  const context = useContext(QuadtreeContext);
  if (!context) {
    throw new Error("useQuadtree must be used within a QuadtreeProvider");
  }
  return context;
};

// Utility hook for quadtree controls
export const useQuadtreeControls = () => {
  const { initializeQuadtree, insertPoint, reset } = useQuadtree();

  const generateRandomPoints = useCallback(
    (count: number, radius: number) => {
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = radius * Math.cbrt(Math.random()); // Cube root for uniform distribution

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        insertPoint(new THREE.Vector3(x, y, z));
      }
    },
    [insertPoint]
  );

  return {
    initializeQuadtree,
    insertPoint,
    reset,
    generateRandomPoints,
  };
};
