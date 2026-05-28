import type { GraphNode, GraphEdge } from '../types/runtime-types';

/**
 * Manages the In-Memory Knowledge Graph (nodes and edges connecting documents, blocks, and tags).
 */
export class GraphRuntime {
  private static instance: GraphRuntime | null = null;

  // Map of Node ID to GraphNode
  private nodes = new Map<string, GraphNode>();
  // Set of serialized edges to prevent duplicates: "source::target::type"
  private edgeKeys = new Set<string>();

  private constructor() {}

  public static getInstance(): GraphRuntime {
    if (!GraphRuntime.instance) {
      GraphRuntime.instance = new GraphRuntime();
    }
    return GraphRuntime.instance;
  }

  /**
   * Adds a node to the graph.
   */
  public addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Removes a node and all of its connected edges.
   */
  public removeNode(id: string): void {
    this.nodes.delete(id);
    // Remove connected edges
    for (const key of this.edgeKeys) {
      const [source, target] = key.split('::');
      if (source === id || target === id) {
        this.edgeKeys.delete(key);
      }
    }
  }

  /**
   * Adds a directed edge to the graph.
   */
  public addEdge(edge: GraphEdge): void {
    const key = `${edge.source}::${edge.target}::${edge.type}`;
    this.edgeKeys.add(key);
  }

  /**
   * Removes an edge.
   */
  public removeEdge(source: string, target: string, type: string): void {
    const key = `${source}::${target}::${type}`;
    this.edgeKeys.delete(key);
  }

  /**
   * Gets all nodes.
   */
  public getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Gets all edges.
   */
  public getEdges(): GraphEdge[] {
    const result: GraphEdge[] = [];
    for (const key of this.edgeKeys) {
      const [source, target, type] = key.split('::');
      result.push({ source, target, type: type as any });
    }
    return result;
  }

  /**
   * Clears the entire graph.
   */
  public clear(): void {
    this.nodes.clear();
    this.edgeKeys.clear();
  }
}
