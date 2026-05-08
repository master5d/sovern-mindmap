import { Node, Edge } from '@xyflow/react';
import { SOVERNNodeData, JSONCanvas } from '../types';
import { toJSONCanvas, fromJSONCanvas } from './canvasConverter';
import { calculateBudgetRollup, calculateTimelineRollup } from './pmEngine';

/**
 * The GraphManager handles the logic of graph manipulation that can be used by both 
 * the UI (Tauri) and the MCP Server.
 */
export class GraphManager {
  private nodes: Node<SOVERNNodeData>[] = [];
  private edges: Edge[] = [];

  constructor(initialNodes: Node<SOVERNNodeData>[] = [], initialEdges: Edge[] = []) {
    this.nodes = initialNodes;
    this.edges = initialEdges;
  }

  getNodes() { return this.nodes; }
  getEdges() { return this.edges; }

  setGraph(nodes: Node<SOVERNNodeData>[], edges: Edge[]) {
    this.nodes = nodes;
    this.edges = edges;
    this.recalculate();
  }

  recalculate() {
    this.nodes = calculateBudgetRollup(this.nodes, this.edges);
    this.nodes = calculateTimelineRollup(this.nodes, this.edges);
  }

  addNode(node: Node<SOVERNNodeData>, parentId?: string) {
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
    this.nodes = this.nodes.map(n => 
      n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n
    );
    this.recalculate();
  }

  deleteNode(nodeId: string) {
    this.nodes = this.nodes.filter(n => n.id !== nodeId);
    this.edges = this.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    this.recalculate();
  }

  toCanvas(): JSONCanvas {
    return toJSONCanvas(this.nodes, this.edges);
  }

  fromCanvas(canvas: JSONCanvas) {
    const { nodes, edges } = fromJSONCanvas(canvas);
    this.nodes = nodes;
    this.edges = edges;
    this.recalculate();
  }
}
