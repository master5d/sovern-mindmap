import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData } from '../types';

/**
 * Calculates budget roll-up using Bottom-Up DAG traversal.
 */
export const calculateBudgetRollup = (nodes: Node<SOVERNNodeData>[], edges: Edge[]) => {
  const updatedNodes = [...nodes];
  const childrenMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
  });

  const getSubtreeBudget = (nodeId: string): number => {
    const node = updatedNodes.find((n) => n.id === nodeId);
    if (!node) return 0;
    const children = childrenMap.get(nodeId) || [];
    const childrenTotal = children.reduce((sum, childId) => sum + getSubtreeBudget(childId), 0);
    return (node.data.budget || 0) + childrenTotal;
  };

  return updatedNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      rollupBudget: getSubtreeBudget(node.id),
    },
  }));
};

/**
 * Calculates timeline roll-up (earliest start, latest end).
 */
export const calculateTimelineRollup = (nodes: any[], edges: Edge[]) => {
  const updatedNodes = [...nodes];
  const childrenMap = new Map<string, string[]>();
  edges.forEach((edge) => {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
  });

  const getSubtreeDates = (nodeId: string): { start: Date | null, end: Date | null } => {
    const node = updatedNodes.find((n) => n.id === nodeId);
    if (!node) return { start: null, end: null };

    const children = childrenMap.get(nodeId) || [];
    let earliestStart = node.data.dates?.start ? new Date(node.data.dates.start) : null;
    let latestEnd = node.data.dates?.end ? new Date(node.data.dates.end) : null;

    children.forEach((childId) => {
      const childDates = getSubtreeDates(childId);
      if (childDates.start && (!earliestStart || childDates.start < earliestStart)) {
        earliestStart = childDates.start;
      }
      if (childDates.end && (!latestEnd || childDates.end > latestEnd)) {
        latestEnd = childDates.end;
      }
    });

    return { start: earliestStart, end: latestEnd };
  };

  return updatedNodes.map((node) => {
    const rollup = getSubtreeDates(node.id);
    return {
      ...node,
      data: {
        ...node.data,
        rollupDates: {
          start: rollup.start?.toISOString().split('T')[0],
          end: rollup.end?.toISOString().split('T')[0],
        },
      },
    };
  });
};
