import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import type { ProcessNodeData } from '../../stores/blockStore';

const assistantChatMock = vi.fn();

vi.mock('../SourceControl/DiagramDiffViewer', () => ({
  default: () => <div data-testid="diff-viewer-stub" />,
}));

// jsdom lacks crypto.randomUUID in older nodes; happy-dom provides it — keep a guard.
if (typeof crypto.randomUUID !== 'function') {
  Object.defineProperty(crypto, 'randomUUID', { value: () => 'test-uuid' });
}

const unsubscribes: Array<() => void> = [];

beforeEach(() => {
  assistantChatMock.mockReset();
  assistantChatMock.mockResolvedValue({
    success: true,
    answer: 'Wrapped it in a retry scope.',
    edits: [],
    attempts: 1,
    tokenUsage: { prompt: 1, completion: 2, total: 3, costEstimate: 0.0001 },
  });
  const progressListeners: Array<(event: unknown) => void> = [];
  (window as unknown as { rpaforge: Record<string, unknown> }).rpaforge = {
    ai: {
      assistantChat: (...args: unknown[]) => assistantChatMock(...(args as [])),
      cancelAssistant: vi.fn(),
      onAssistantProgress: (listener: (event: unknown) => void) => {
        progressListeners.push(listener);
        return () => {
          const index = progressListeners.indexOf(listener);
          if (index >= 0) progressListeners.splice(index, 1);
        };
      },
    },
  };
  (window as unknown as { __progressListeners?: unknown }).__progressListeners =
    progressListeners;
  unsubscribes.length = 0;
});

import AssistantPanel from './AssistantPanel';
import { useBlockStore } from '../../stores/blockStore';
import { useSelectionStore } from '../../stores/selectionStore';

function activityNode(id: string): Node<ProcessNodeData> {
  return {
    id,
    type: 'activity',
    position: { x: 0, y: 0 },
    data: {
      blockData: {
        id,
        type: 'activity',
        name: id,
        label: id,
        category: 'web-automation',
        activityId: id,
        activityType: 'sync',
        library: 'WebUI',
        params: { selector: '#x' },
        paramTypes: { selector: 'string' },
        builtin: { timeout_ms: 30000, has_retry: false, has_continue_on_error: false },
        tags: [],
      },
      description: undefined,
      tags: [],
    },
  };
}

function seedStore() {
  useBlockStore.setState({
    nodes: [activityNode('click-download')],
    edges: [],
  } as Partial<ReturnType<typeof useBlockStore.getState>>);
  useSelectionStore.setState({ selectedNodeId: 'click-download', selectedEdgeId: null });
}

describe('AssistantPanel', () => {
  it('sends the message with compact context and renders the reply', async () => {
    seedStore();
    render(<AssistantPanel onClose={() => {}} />);
    const input = screen.getByLabelText(/assistant\.placeholder|Ask anything/i);
    fireEvent.change(input, { target: { value: 'add a retry' } });
    fireEvent.click(screen.getByLabelText(/assistant\.send|Send message/i));

    await waitFor(() => {
      expect(screen.getByTestId('assistant-message-assistant')).toBeDefined();
    });
    expect(assistantChatMock).toHaveBeenCalledTimes(1);
    const request = assistantChatMock.mock.calls[0][0] as {
      userMessage: string;
      context: { diagramNodes: Array<{ id: string; paramKeys?: string[] }> };
    };
    expect(request.userMessage).toBe('add a retry');
    expect(request.context.diagramNodes[0].id).toBe('click-download');
    expect(request.context.diagramNodes[0].paramKeys).toEqual(['selector']);
    expect(screen.getByTestId('assistant-message-assistant').textContent).toContain(
      'Wrapped it in a retry scope.'
    );
    // per-message token/cost display
    expect(screen.getByTestId('assistant-message-assistant').textContent).toContain('3 tok');
  });

  it('accumulates streaming deltas into the working bubble', async () => {
    seedStore();
    let resolveChat: (value: unknown) => void = () => {};
    assistantChatMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveChat = resolve;
        })
    );
    render(<AssistantPanel onClose={() => {}} />);
    const listeners =
      (window as unknown as { __progressListeners?: Array<(event: unknown) => void> })
        .__progressListeners ?? [];
    const input = screen.getByLabelText(/assistant\.placeholder|Ask anything/i);
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.click(screen.getByLabelText(/assistant\.send|Send message/i));

    await waitFor(() => {
      expect(listeners.length).toBeGreaterThan(0);
    });
    act(() => {
      listeners.forEach((listener) =>
        listener({
          requestId: (assistantChatMock.mock.calls[0][0] as { requestId: string }).requestId,
          attempt: 1,
          delta: 'partial ',
        })
      );
    });
    expect(screen.getByTestId('assistant-streaming').textContent).toContain('partial');

    resolveChat({ success: true, answer: 'done', edits: [], attempts: 1 });
    await waitFor(() => {
      expect(screen.queryByTestId('assistant-streaming')).toBeNull();
    });
  });

  it('offers a diff review button when the reply carries edits', async () => {
    seedStore();
    assistantChatMock.mockResolvedValue({
      success: true,
      answer: 'Here is my proposal.',
      edits: [{ type: 'wrap_retry', node_id: 'click-download', retry_count: 3 }],
      attempts: 1,
    });
    render(<AssistantPanel onClose={() => {}} />);
    const input = screen.getByLabelText(/assistant\.placeholder|Ask anything/i);
    fireEvent.change(input, { target: { value: 'add retry' } });
    fireEvent.click(screen.getByLabelText(/assistant\.send|Send message/i));

    const reviewButton = await screen.findByText(/reviewDiff|Review diff|1/i);
    expect(reviewButton).toBeDefined();
  });

  it('shows an error state when the provider fails', async () => {
    seedStore();
    assistantChatMock.mockResolvedValue({
      success: false,
      errors: ['Provider "openai-compatible" is not configured.'],
      attempts: 0,
    });
    render(<AssistantPanel onClose={() => {}} />);
    const input = screen.getByLabelText(/assistant\.placeholder|Ask anything/i);
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.click(screen.getByLabelText(/assistant\.send|Send message/i));
    await waitFor(() => {
      expect(screen.getByTestId('assistant-error')).toBeDefined();
    });
  });
});
