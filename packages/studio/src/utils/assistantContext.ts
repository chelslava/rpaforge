/**
 * Compact assistant context builder (issue #903).
 *
 * Pure function over the canvas document + selection: produces the
 * value-free node summary the assistant prompt receives (ids, labels,
 * types, param KEY names only — param values never leave the machine
 * unless the user typed them into the chat themselves).
 */

import type { Edge, Node } from '@xyflow/react';
import type { ProcessNodeData } from '../stores/blockStore';
import type { AssistantChatContext } from '../types/ai';

function nodeLabel(node: Node<ProcessNodeData>): string {
  const blockData = node.data.blockData;
  if (blockData?.label) return String(blockData.label);
  if (blockData?.name) return String(blockData.name);
  return node.id;
}

function nodeType(node: Node<ProcessNodeData>): string {
  return node.data.blockData?.type ?? node.type ?? 'unknown';
}

function paramKeys(node: Node<ProcessNodeData>): string[] {
  const blockData = node.data.blockData as unknown as {
    params?: Record<string, unknown>;
  } | undefined;
  return blockData?.params ? Object.keys(blockData.params) : [];
}

export function buildAssistantContext(
  nodes: Node<ProcessNodeData>[],
  _edges: Edge[],
  selectedNodeId: string | null,
  lastError?: string | null
): AssistantChatContext {
  return {
    diagramNodes: nodes.map((node) => ({
      id: node.id,
      label: nodeLabel(node),
      type: nodeType(node),
      paramKeys: paramKeys(node),
    })),
    selectedNodeId,
    lastError: lastError ?? null,
  };
}
