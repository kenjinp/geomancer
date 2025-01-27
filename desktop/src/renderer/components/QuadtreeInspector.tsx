import { Button } from "@nextui-org/button";
import * as React from "react";
import { Tree } from "react-arborist";
import { Vector3 } from "three";
import { useQuadtree } from "../providers/QuadtreeProvider";

interface QuadtreeNode {
  id: string;
  name: string;
  children?: QuadtreeNode[];
  isLeaf?: boolean;
  data: {
    faceIndex: number;
    nodeIndex: number;
    center: Vector3;
    size: Vector3;
    childCount: number;
    level: number;
    isRoot: boolean;
    isLeaf: boolean;
    isSplit: boolean;
    isBoundary: boolean;
  };
}

interface QuadtreeInspectorProps {
  className?: string;
}

export const QuadtreeInspector: React.FC<QuadtreeInspectorProps> = ({
  className,
}) => {
  const { quadtree } = useQuadtree();

  if (!quadtree) {
    return null;
  }

  // Create the initial tree data with just the root nodes (faces)
  const createInitialData = React.useCallback((): QuadtreeNode[] => {
    return quadtree.getFaces().map((face, faceIndex) => {
      const rootNodeInfo = face.getNodeInfo(0);
      console.log(rootNodeInfo);
      return {
        id: `face-${faceIndex}-node-0`,
        name: `Face ${faceIndex}`,
        isLeaf: false,
        data: {
          faceIndex,
          nodeIndex: 0,
          ...rootNodeInfo,
        },
      };
    });
  }, [quadtree]);

  const [treeData, setTreeData] = React.useState<QuadtreeNode[]>(
    createInitialData()
  );

  // Function to get child nodes for a parent node
  const getChildNodes = React.useCallback(
    (
      parentId: string,
      faceIndex: number,
      nodeIndex: number
    ): QuadtreeNode[] => {
      const face = quadtree.getFace(faceIndex);
      const childCount = face.nodeBuffer.getChildCount(nodeIndex);
      const children: QuadtreeNode[] = [];

      for (let i = 0; i < childCount; i++) {
        const childIndex = face.nodeBuffer.getChildIndex(nodeIndex, i);
        if (childIndex !== -1) {
          const childInfo = face.getNodeInfo(childIndex);
          children.push({
            id: `face-${faceIndex}-node-${childIndex}`,
            name: `Node ${childIndex}`,
            isLeaf: childInfo.isLeaf,
            data: {
              faceIndex,
              nodeIndex: childIndex,
              ...childInfo,
            },
          });
        }
      }

      return children;
    },
    [quadtree]
  );

  // Handler for loading children
  const handleLoadMore = React.useCallback(
    (node: QuadtreeNode) => {
      const { faceIndex, nodeIndex } = node.data;
      const children = getChildNodes(node.id, faceIndex, nodeIndex);

      setTreeData((prevData) => {
        // Helper function to update nodes recursively
        const updateNodes = (nodes: QuadtreeNode[]): QuadtreeNode[] => {
          return nodes.map((n) => {
            if (n.id === node.id) {
              return {
                ...n,
                children,
              };
            }
            if (n.children) {
              return {
                ...n,
                children: updateNodes(n.children),
              };
            }
            return n;
          });
        };

        return updateNodes(prevData);
      });
    },
    [getChildNodes]
  );

  // Custom node renderer
  const NodeRenderer = React.useCallback(
    ({ node, style, dragHandle }: any) => {
      const {
        data: { data },
      } = node;
      console.log({ node });
      const level = data.level;
      const size = data.size.x.toFixed(2);
      const position = `(${data.center.x.toFixed(1)}, ${data.center.y.toFixed(
        1
      )}, ${data.center.z.toFixed(1)})`;

      const handleClick = () => {
        if (!node.isLeaf && (!node.children || node.children.length === 0)) {
          handleLoadMore(node);
        }
      };

      return (
        <div
          ref={dragHandle}
          className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-gray-100"
          style={style}
          onClick={handleClick}
        >
          <span>{node.name}</span>
          <span className="text-gray-500">
            Level: {level}, Size: {size}, Pos: {position}
            {data.isLeaf && " (Leaf)"}
            {data.isBoundary && " (Boundary)"}
          </span>
        </div>
      );
    },
    [handleLoadMore]
  );

  const moveToNode = () => {
    const node = quadtree.getNodeInfoFromIncrementalIndex(14);
    window.moveToTarget(node.sphereCenter);
  };

  return (
    <div
      className={`bg-dark bg-opacity-75 p-4 rounded-lg shadow-lg text-sm h-full min-h-[400px] overflow-auto ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quadtree Inspector</h2>
        <Button onClick={moveToNode}>14</Button>
      </div>
      <Tree
        data={treeData}
        openByDefault={false}
        width={800}
        height={600}
        indent={24}
        rowHeight={32}
        onLoadMore={handleLoadMore}
      >
        {NodeRenderer}
      </Tree>
    </div>
  );
};
