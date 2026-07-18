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

  const matchingNodeIds = useMemo(() => {
    if (!normalizedQuery) {
      return new Set(nodes.map((node) => node.id));
    }

    return new Set(
      nodes
        .filter((node) => getNodeSearchText(node).includes(normalizedQuery))
        .map((node) => node.id)
    );
  }, [nodes, normalizedQuery]);

  return {
    query,
    setQuery,
    matchingNodeIds,
    matchCount: normalizedQuery ? matchingNodeIds.size : 0,
    totalCount: nodes.length,
    isSearching: Boolean(normalizedQuery),
  };
}
