import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { getNodeSearchText, useNodeSearch } from './useNodeSearch';
import type { ProcessNodeData } from '../stores/blockStore';
import type { BlockData } from '../types/blocks';

function node(id: string, name: string, label = name): Node<ProcessNodeData> {
  return {
    id,
    type: 'activity',
    position: { x: 0, y: 0 },
    data: {
      blockData: {
        id,
        type: 'activity',
        name,
        label,
        category: 'Test',
      } as unknown as BlockData,
    },
  };
}

describe('useNodeSearch', () => {
  it('searches activity names and labels case-insensitively', () => {
    const nodes = [node('one', 'Open Browser', 'Launch'), node('two', 'Save File')];
    const { result } = renderHook(() => useNodeSearch(nodes));

    act(() => result.current.setQuery('launch'));

    expect(result.current.matchCount).toBe(1);
    expect(result.current.matchingNodeIds).toEqual(new Set(['one']));
  });

  it('returns all nodes when the query is empty', () => {
    const nodes = [node('one', 'Open Browser'), node('two', 'Save File')];
    const { result } = renderHook(() => useNodeSearch(nodes));

    expect(result.current.isSearching).toBe(false);
    expect(result.current.matchingNodeIds).toEqual(new Set(['one', 'two']));
    expect(result.current.matchCount).toBe(0);
  });

  it('includes descriptions in searchable text', () => {
    const searchable = getNodeSearchText({
      ...node('one', 'Open Browser'),
      data: { ...node('one', 'Open Browser').data, description: 'opens a web page' },
    });

    expect(searchable).toContain('opens a web page');
  });
});
