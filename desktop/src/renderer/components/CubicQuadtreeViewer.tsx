import React from "react";
import { useQuadtree } from "./QuadtreeContext";

const FACE_NAMES = [
  "Right (+X)",
  "Left (-X)",
  "Top (+Y)",
  "Bottom (-Y)",
  "Front (+Z)",
  "Back (-Z)",
];

const QuadtreeNode: React.FC<{
  nodeInfo: any;
  level: number;
  isLeaf: boolean;
}> = ({ nodeInfo, level, isLeaf }) => {
  const borderColor = isLeaf ? "border-blue-500" : "border-gray-300";
  const bgColor = nodeInfo.isBoundary ? "bg-yellow-50" : "bg-white";

  return (
    <div
      className={`border ${borderColor} ${bgColor} p-1 m-0.5`}
      style={{
        minWidth: `${Math.max(20, 100 / Math.pow(2, level))}px`,
        minHeight: `${Math.max(20, 100 / Math.pow(2, level))}px`,
      }}
    >
      {!isLeaf && (
        <div className="grid grid-cols-2 gap-0.5">
          {Array(4)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="aspect-square" />
            ))}
        </div>
      )}
    </div>
  );
};

const FaceView: React.FC<{
  face: any;
  faceIndex: number;
}> = ({ face, faceIndex }) => {
  const renderNode = (nodeIndex: number, level: number = 0) => {
    const nodeInfo = face.getNodeInfo(nodeIndex);

    if (nodeInfo.isLeaf) {
      return (
        <QuadtreeNode
          key={nodeIndex}
          nodeInfo={nodeInfo}
          level={level}
          isLeaf={true}
        />
      );
    }

    return (
      <div key={nodeIndex} className="relative">
        <QuadtreeNode nodeInfo={nodeInfo} level={level} isLeaf={false} />
        <div className="absolute inset-0 grid grid-cols-2 gap-0.5">
          {Array(nodeInfo.childCount)
            .fill(0)
            .map((_, i) => {
              const childIndex = face.nodeBuffer.getChildIndex(nodeIndex, i);
              return <div key={i}>{renderNode(childIndex, level + 1)}</div>;
            })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-center p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">{FACE_NAMES[faceIndex]}</h3>
      <div className="relative w-[200px] h-[200px]">{renderNode(0)}</div>
      <div className="mt-2 text-sm text-gray-600">
        Nodes: {face.nodeBuffer.size}
      </div>
    </div>
  );
};

export const CubicQuadtreeViewer = () => {
  const { quadtree } = useQuadtree();
  const faces = quadtree.getFaces();

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Cubic Quadtree Visualization</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {faces.map((face, index) => (
          <FaceView key={index} face={face} faceIndex={index} />
        ))}
      </div>
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Tree Statistics</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium">Total Nodes</h4>
            <p>{quadtree.getCompactedIntBuffer().length}</p>
          </div>
          <div>
            <h4 className="font-medium">Buffer Capacity</h4>
            <p>{quadtree.unifiedBuffer.intBuffer.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
