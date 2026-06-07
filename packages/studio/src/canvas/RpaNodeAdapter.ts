/**
 * Adapter between domain RpaNode/RpaEdge and React Flow Node/Edge types
 * Enables canvas-layer to work with React Flow while domain works with RpaNode/RpaEdge
 */

import type { Node, Edge } from '@reactflow/core';
import type { RpaNode, RpaEdge } from '../types/domain-model';

export function rpaNodeToReactFlowNode<D = unknown>(rpaNode: RpaNode<D>): Node<D> {
  return {
    id: rpaNode.id,
    data: rpaNode.data,
    position: rpaNode.position ?? { x: 0, y: 0 },
    width: rpaNode.width,
    height: rpaNode.height,
  };
}

export function reactFlowNodeToRpaNode<D = unknown>(node: Node<D>): RpaNode<D> {
  return {
    id: node.id,
    data: node.data,
    position: node.position,
    width: node.width,
    height: node.height,
  };
}

export function rpaEdgeToReactFlowEdge(rpaEdge: RpaEdge): Edge {
  return {
    id: rpaEdge.id,
    source: rpaEdge.source,
    target: rpaEdge.target,
    sourceHandle: rpaEdge.handle,
  };
}

export function reactFlowEdgeToRpaEdge(edge: Edge): RpaEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    handle: edge.sourceHandle as string | null,
  };
}

export function rpaNodeArrayToReactFlowNodes<D = unknown>(rpaNodes: RpaNode<D>[]): Node<D>[] {
  return rpaNodes.map(rpaNodeToReactFlowNode);
}

export function reactFlowNodeArrayToRpaNodes<D = unknown>(nodes: Node<D>[]): RpaNode<D>[] {
  return nodes.map(reactFlowNodeToRpaNode);
}

export function rpaEdgeArrayToReactFlowEdges(rpaEdges: RpaEdge[]): Edge[] {
  return rpaEdges.map(rpaEdgeToReactFlowEdge);
}

export function reactFlowEdgeArrayToRpaEdges(edges: Edge[]): RpaEdge[] {
  return edges.map(reactFlowEdgeToRpaEdge);
}
