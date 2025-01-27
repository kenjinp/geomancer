import * as React from "react";
import { CubicQuadtree } from "../../lib/Quadtree/CubicQuadtree";

interface QuadtreeContextValue {
  quadtree: CubicQuadtree | null;
  setQuadtree: (quadtree: CubicQuadtree) => void;
}

const QuadtreeContext = React.createContext<QuadtreeContextValue | null>(null);

interface QuadtreeProviderProps {
  children: React.ReactNode;
  initialQuadtree?: CubicQuadtree;
}

export const QuadtreeProvider: React.FC<QuadtreeProviderProps> = ({
  children,
  initialQuadtree = null,
}) => {
  const [quadtree, setQuadtree] = React.useState<CubicQuadtree | null>(
    initialQuadtree
  );

  const value = React.useMemo(
    () => ({
      quadtree,
      setQuadtree,
    }),
    [quadtree]
  );

  return (
    <QuadtreeContext.Provider value={value}>
      {children}
    </QuadtreeContext.Provider>
  );
};

export const useQuadtree = () => {
  const context = React.useContext(QuadtreeContext);
  if (!context) {
    throw new Error("useQuadtree must be used within a QuadtreeProvider");
  }
  return context;
};
