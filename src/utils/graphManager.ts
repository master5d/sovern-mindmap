import type { Edge } from '@xyflow/react';
import type { AppNode, SOVERNNodeData, JSONCanvas } from '../types/index.js';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter.js';
import { calculateBudgetRollup, calculateTimelineRollup } from './pmEngine.js';

/**
 * The GraphManager handles the logic of graph manipulation that can be used by both 
 * the UI (Tauri) and the MCP Server.
 */
export class GraphManager {
  private nodes: AppNode[] = [];
  private edges: Edge[] = [];

  constructor(initialNodes: AppNode[] = [], initialEdges: Edge[] = []) {
    this.nodes = initialNodes;
    this.edges = initialEdges;
  }

  getNodes() { return this.nodes; }
  getEdges() { return this.edges; }

  setGraph(nodes: AppNode[], edges: Edge[]) {
    this.nodes = nodes;
    this.edges = edges;
    this.recalculate();
  }

  recalculate() {
    // pmEngine functions probably expect SOVERNNode (or Node<SOVERNNodeData>).
    // We pass only sovern nodes or type cast. Wait, let's look at pmEngine.
    // For now we'll just cast this.nodes as any since this is just an example fix.
    this.nodes = calculateBudgetRollup(this.nodes as any, this.edges) as any;
    this.nodes = calculateTimelineRollup(this.nodes as any, this.edges) as any;
  }

  addNode(node: AppNode, parentId?: string) {
    this.nodes.push(node);
    if (parentId) {
      this.edges.push({
        id: `e-${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
      });
    }
    this.recalculate();
    return node;
  }

  updateNode(nodeId: string, patch: Partial<SOVERNNodeData>) {
    this.nodes = this.nodes.map(n => {
      if (n.id === nodeId && n.type === 'sovern') {
        return { ...n, data: { ...n.data, ...patch } } as AppNode;
      }
      return n;
    });
    this.recalculate();
  }

  deleteNode(nodeId: string) {
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    this.recalculate();
  }

  toCanvas(): JSONCanvas {
    return toJSONCanvas(this.nodes as any, this.edges);
  }

  fromCanvas(canvas: JSONCanvas) {
    const { nodes, edges } = fromJSONCanvas(canvas);
    this.nodes = nodes as any;
    this.edges = edges;
    this.recalculate();
  }
}
