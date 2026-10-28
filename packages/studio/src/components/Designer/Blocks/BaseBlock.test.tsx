import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { BaseBlock } from './BaseBlock';
import type { BlockData } from '../../../types/blocks';
import { useExecutionStore } from '../../../stores/executionStore';
import { useDebuggerStore } from '../../../stores/debuggerStore';

vi.mock('@xyflow/react', () => ({
  Handle: ({ position }: { position: string }) => (
    <div data-testid={`handle-${position}`} />
  ),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useConnection: (selector: (state: { inProgress: boolean; fromHandle: null }) => unknown) =>
    selector({ inProgress: false, fromHandle: null }),
}));

const renderBlock = (id: string) => {
  const data = {
    id,
    type: 'end',
    name: 'End',
    label: 'End',
    category: 'flow',
  } as unknown as BlockData;
  render(
    <BaseBlock data={data} showPorts={false}>
      <div>content</div>
    </BaseBlock>,
  );
  return screen.getByRole('button', { name: /end block/i });
};

describe('BaseBlock paused highlight', () => {
  beforeEach(() => {
    useExecutionStore.setState({ currentExecutingNodeId: null });
    useDebuggerStore.setState({ isPaused: false });
  });

  test('shows node-paused (not node-executing) on the paused node', () => {
    useExecutionStore.setState({ currentExecutingNodeId: 'node-1' });
    useDebuggerStore.setState({ isPaused: true });

    const block = renderBlock('node-1');
    expect(block.className).toContain('node-paused');
    expect(block.className).not.toContain('node-executing');
  });

  test('shows node-executing for the current node while running', () => {
    useExecutionStore.setState({ currentExecutingNodeId: 'node-1' });
    useDebuggerStore.setState({ isPaused: false });

    const block = renderBlock('node-1');
    expect(block.className).toContain('node-executing');
    expect(block.className).not.toContain('node-paused');
  });

  test('other nodes stay unhighlighted while one node is paused', () => {
    useExecutionStore.setState({ currentExecutingNodeId: 'node-1' });
    useDebuggerStore.setState({ isPaused: true });

    const block = renderBlock('node-2');
    expect(block.className).not.toContain('node-paused');
    expect(block.className).not.toContain('node-executing');
  });
});
