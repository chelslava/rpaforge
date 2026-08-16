import { useMemo, useState } from 'react';
import type { ProcessNode } from '../stores/blockStore';

export function getNodeSearchText(node: ProcessNode): string {
  const blockData = node.data.blockData;
  return [
    blockData?.name,
    blockData?.label,
    blockData?.description,
    node.data.activity?.name,
    node.data.description,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLocaleLowerCase();
}

export function useNodeSearch(nodes: ProcessNode[]) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const nodeSearchTexts = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      map.set(node.id, getNodeSearchText(node));
    }
    return map;
  }, [nodes]);

  const matchingNodeIds = useMemo(() => {
    if (!normalizedQuery) {
      return new Set(nodes.map((node) => node.id));
    }

    const matches = new Set<string>();
    for (const node of nodes) {
      const text = nodeSearchTexts.get(node.id) || '';
      if (text.includes(normalizedQuery)) {
        matches.add(node.id);
      }
    }
    return matches;
  }, [nodes, normalizedQuery, nodeSearchTexts]);

  return {
    query,
    setQuery,
    matchingNodeIds,
    matchCount: normalizedQuery ? matchingNodeIds.size : 0,
    totalCount: nodes.length,
    isSearching: Boolean(normalizedQuery),
  };
}
