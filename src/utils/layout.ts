import dagre from 'dagre';
import { Node, Edge } from '@xyflow/react';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Adjust these to match or slightly exceed the actual node size + desired padding
const nodeWidth = 240;
const nodeHeight = 180;

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  
  // Set global graph layout options
  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80, // Horizontal spacing between nodes in the same rank
    ranksep: 100, // Vertical spacing between ranks
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    // We can try to use measured dimensions if available, otherwise fallback to defaults
    const width = node.measured?.width ?? nodeWidth;
    const height = node.measured?.height ?? nodeHeight;
    
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.measured?.width ?? nodeWidth;
    const height = node.measured?.height ?? nodeHeight;

    return {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};
