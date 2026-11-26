/**
 * Deterministic applier for AI diagnosis fix proposals (issue #906).
 *
 * Pure functions over the canvas document shape ({nodes, edges} of
 * react-flow Node<ProcessNodeData>/Edge) so the result can be diffed
 * (diffDiagrams) and pushed through the regular designer undo path.
 * Every proposal either applies deterministically or is skipped with a
 * reason — the model never mutates the diagram directly.
 */

import type { Edge, Node } from '@xyflow/react';
import type { FixProposal } from '../types/ai';
import type { ProcessNodeData } from '../stores/processStore';
import { createActivityBlockData, createDefaultBlockData, type BlockData } from '../types/blocks';
import { createConnection } from '../types/connections';
import type { Activity } from '@rpaforge/activities';

export interface ProposalApplyContext {
  /** Resolves the Activity snapshot for insert_precondition nodes. */
  resolveActivity?: (library: string, activityName: string) => Activity | undefined;
}

export interface ProposalSkip {
  proposal: FixProposal;
  reason: string;
}

export interface ProposalApplyResult {
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  applied: FixProposal[];
  skipped: ProposalSkip[];
}

function cloneNodes(
  nodes: Node<ProcessNodeData>[]
): Node<ProcessNodeData>[] {
  return nodes.map((node) => ({ ...node, data: { ...node.data } }));
}

function uniqueId(base: string, nodes: Node<ProcessNodeData>[]): string {
  let candidate = base;
  let suffix = 2;
  while (nodes.some((node) => node.id === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function findNode(
  nodes: Node<ProcessNodeData>[],
  id: string
): Node<ProcessNodeData> | undefined {
  return nodes.find((node) => node.id === id);
}

function positionNear(
  nodes: Node<ProcessNodeData>[],
  targetId: string
): { x: number; y: number } {
  const target = findNode(nodes, targetId);
  const x = target?.position?.x ?? 0;
  const y = target?.position?.y ?? 0;
  return { x: x + 60, y: y + 90 };
}

/** Block data view with the optional activity-param fields surfaced. */
type ParamedBlockData = BlockData & {
  params?: Record<string, unknown>;
  paramTypes?: Record<string, string>;
};

/** The activity param key a selector lives under for this node, if any. */
function selectorParamKey(node: Node<ProcessNodeData>): string | null {
  const blockData = node.data.blockData as ParamedBlockData | undefined;
  const keys = new Set<string>();
  if (blockData?.params) {
    Object.keys(blockData.params).forEach((key) => keys.add(key));
  }
  if (blockData?.paramTypes) {
    Object.keys(blockData.paramTypes).forEach((key) => keys.add(key));
  }
  if (keys.size === 0) return 'selector';
  const match = [...keys].find((key) => /selector/i.test(key));
  return match ?? null;
}

function cloneBlockData(node: Node<ProcessNodeData>): ParamedBlockData {
  const blockData = node.data.blockData as ParamedBlockData;
  return {
    ...blockData,
    params: blockData.params ? { ...blockData.params } : {},
  };
}

function applyParamChange(
  node: Node<ProcessNodeData>,
  proposal: Extract<FixProposal, { type: 'param_change' }>
): string | null {
  const blockData = node.data.blockData as ParamedBlockData | undefined;
  if (!blockData || !blockData.params) {
    return 'target node has no activity params';
  }
  const params = blockData.params;
  const paramTypes = blockData.paramTypes;
  const known = paramTypes
    ? Object.keys(paramTypes)
    : Object.keys(params);
  if (known.length > 0 && !known.includes(proposal.param)) {
    return `node has no param "${proposal.param}"`;
  }
  node.data.blockData = {
    ...blockData,
    params: { ...params, [proposal.param]: proposal.new_value },
  } as ParamedBlockData;
  return null;
}

function wrapTarget(
  nodes: Node<ProcessNodeData>[],
  edges: Edge[],
  proposal: Extract<FixProposal, { type: 'wrap_retry' | 'wrap_trycatch' }>
): string | null {
  const target = findNode(nodes, proposal.node_id);
  if (!target) return `node "${proposal.node_id}" not found`;
  if (target.data.blockData?.type === 'retry-scope' || target.data.blockData?.type === 'try-catch') {
    return 'target is already a wrapping block';
  }

  const wrapperId = uniqueId(
    proposal.type === 'wrap_retry' ? 'retry-scope' : 'try-catch',
    nodes
  );
  const base = createDefaultBlockData(
    proposal.type === 'wrap_retry' ? 'retry-scope' : 'try-catch',
    wrapperId
  );
  let blockData: BlockData;
  if (proposal.type === 'wrap_retry') {
    blockData = {
      ...base,
      type: 'retry-scope',
      retryCount: proposal.retry_count ?? 3,
      retryInterval: `${proposal.retry_interval_s ?? 2}s`,
      body: [target.id],
    } as BlockData;
  } else {
    blockData = {
      ...base,
      type: 'try-catch',
      tryBlock: [target.id],
      exceptBlocks: [
        {
          id: uniqueId('except', nodes),
          exceptionType: proposal.exception_type ?? '',
          handler: [],
        },
      ],
      finallyBlock: [],
    } as BlockData;
  }

  const wrapper: Node<ProcessNodeData> = {
    id: wrapperId,
    type: proposal.type === 'wrap_retry' ? 'retry-scope' : 'try-catch',
    position: positionNear(nodes, target.id),
    data: { blockData, description: undefined, tags: [] },
  };

  const nextEdges: Edge[] = [];
  for (const edge of edges) {
    if (edge.target === target.id) {
      nextEdges.push({
        ...edge,
        id: `edge_${edge.source}_${edge.sourceHandle ?? 'output'}_${wrapperId}_input`,
        target: wrapperId,
        targetHandle: 'input',
      });
    } else if (edge.source === target.id) {
      nextEdges.push({
        ...edge,
        id: `edge_${wrapperId}_output_${edge.target}_${edge.targetHandle ?? 'input'}`,
        source: wrapperId,
        sourceHandle: 'output',
      });
    } else {
      nextEdges.push(edge);
    }
  }

  nodes.push(wrapper);
  edges.length = 0;
  edges.push(...nextEdges);
  return null;
}

export function applyProposals(
  inputNodes: Node<ProcessNodeData>[],
  inputEdges: Edge[],
  proposals: FixProposal[],
  context: ProposalApplyContext = {}
): ProposalApplyResult {
  const nodes = cloneNodes(inputNodes);
  const edges: Edge[] = inputEdges.map((edge) => ({ ...edge }));
  const applied: FixProposal[] = [];
  const skipped: ProposalSkip[] = [];

  for (const proposal of proposals) {
    let error: string | null = null;
    switch (proposal.type) {
      case 'param_change': {
        const node = findNode(nodes, proposal.node_id);
        if (!node) {
          error = `node "${proposal.node_id}" not found`;
          break;
        }
        error = applyParamChange(node, proposal);
        break;
      }
      case 'selector_update': {
        const node = findNode(nodes, proposal.node_id);
        if (!node) {
          error = `node "${proposal.node_id}" not found`;
          break;
        }
        const key = selectorParamKey(node);
        if (key === null) {
          error = 'target node has no selector param';
          break;
        }
        const blockData = cloneBlockData(node);
        (blockData as unknown as { params: Record<string, unknown> }).params[key] =
          proposal.new_selector;
        node.data.blockData = blockData;
        break;
      }
      case 'wrap_retry':
      case 'wrap_trycatch': {
        error = wrapTarget(nodes, edges, proposal);
        break;
      }
      case 'insert_precondition': {
        const anchor = findNode(nodes, proposal.after_node_id);
        if (!anchor) {
          error = `node "${proposal.after_node_id}" not found`;
          break;
        }
        const activity = context.resolveActivity?.(
          proposal.library,
          proposal.activity
        );
        if (!activity) {
          error = `activity "${proposal.library}.${proposal.activity}" is not available in the registry`;
          break;
        }
        const nodeId = uniqueId('precondition', nodes);
        const blockData = createActivityBlockData(activity, nodeId);
        if (proposal.args) {
          blockData.params = { ...blockData.params, ...proposal.args };
        }
        if (proposal.label) {
          blockData.name = proposal.label;
          blockData.label = proposal.label;
        }
        const node: Node<ProcessNodeData> = {
          id: nodeId,
          type: 'activity',
          position: positionNear(nodes, anchor.id),
          data: { blockData, description: undefined, tags: [] },
        };
        const nextEdges: Edge[] = [];
        for (const edge of edges) {
          if (edge.target === anchor.id) {
            nextEdges.push(edge);
            nextEdges.push(createConnection(edge.source, nodeId, edge.sourceHandle ?? 'output', 'input'));
            nextEdges.push(createConnection(nodeId, anchor.id, 'output', 'input'));
          } else {
            nextEdges.push(edge);
          }
        }
        nodes.push(node);
        edges.length = 0;
        edges.push(...nextEdges);
        break;
      }
    }
    if (error === null) {
      applied.push(proposal);
    } else {
      skipped.push({ proposal, reason: error });
    }
  }

  return { nodes, edges, applied, skipped };
}

/** Short human label for a proposal (i18n keys resolved by the caller). */
export function proposalTargetId(proposal: FixProposal): string {
  return proposal.type === 'insert_precondition'
    ? proposal.after_node_id
    : proposal.node_id;
}
