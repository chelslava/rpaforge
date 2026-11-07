import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import BreakpointPanel from './BreakpointPanel';
import { useDebuggerStore } from '../../stores/debuggerStore';
import type { Breakpoint } from '../../types/engine';

const evaluateExpression = vi.fn();

vi.mock('../../hooks/useEngine', () => ({
  useEngine: () => ({ evaluateExpression }),
}));

const BP_ID = 'bp-node1';

const addBp = (overrides: Partial<Breakpoint> = {}) => {
  const bp: Breakpoint = {
    id: BP_ID,
    file: 'node1',
    line: 0,
    nodeId: 'node1',
    enabled: true,
    ...overrides,
  };
  useDebuggerStore.getState().addBreakpoint(bp);
};

describe('BreakpointPanel conditional editing (issue #867)', () => {
  beforeEach(() => {
    evaluateExpression.mockReset();
    useDebuggerStore.persist.clearStorage();
    const state = useDebuggerStore.getState();
    state.reset();
    state.clearBreakpoints();
    state.clearWatchedVariables();
  });

  test('renders condition and hit-count chips for a conditional breakpoint', () => {
    addBp({ condition: 'count > 3', hitCondition: '5' });
    render(<BreakpointPanel />);
    expect(screen.getByText('count > 3')).toBeInTheDocument();
    expect(screen.getByText('breakpoints.hitCountChip')).toBeInTheDocument();
  });

  test('editing saves condition and hit count into the store', async () => {
    addBp();
    evaluateExpression.mockResolvedValue({ ok: true, value: true, type: 'bool' });
    render(<BreakpointPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.editBreakpoint' }));
    const editor = screen.getByTestId(`breakpoint-editor-${BP_ID}`);
    expect(editor).toBeInTheDocument();

    fireEvent.change(editor.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'count > 3' },
    });
    fireEvent.change(
      screen.getByLabelText('breakpoints.hitCountLabel') as HTMLInputElement,
      { target: { value: '5' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.saveBreakpoint' }));

    await waitFor(() => {
      const bp = useDebuggerStore.getState().breakpoints.get(BP_ID);
      expect(bp?.condition).toBe('count > 3');
      expect(bp?.hitCondition).toBe('5');
    });
    // Editor closes after a successful save.
    await waitFor(() => {
      expect(
        screen.queryByTestId(`breakpoint-editor-${BP_ID}`)
      ).not.toBeInTheDocument();
    });
    expect(evaluateExpression).toHaveBeenCalledWith('count > 3');
  });

  test('clears condition and hit count when inputs are emptied', async () => {
    addBp({ condition: 'count > 3', hitCondition: '5' });
    evaluateExpression.mockResolvedValue({ ok: true, value: true, type: 'bool' });
    render(<BreakpointPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.editBreakpoint' }));
    const editor = screen.getByTestId(`breakpoint-editor-${BP_ID}`);
    fireEvent.change(editor.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: '' },
    });
    fireEvent.change(
      screen.getByLabelText('breakpoints.hitCountLabel') as HTMLInputElement,
      { target: { value: '' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.saveBreakpoint' }));

    await waitFor(() => {
      const bp = useDebuggerStore.getState().breakpoints.get(BP_ID);
      expect(bp?.condition).toBeUndefined();
      expect(bp?.hitCondition).toBeUndefined();
    });
  });

  test('invalid hit count shows inline error and keeps the editor open', async () => {
    addBp();
    render(<BreakpointPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.editBreakpoint' }));
    fireEvent.change(
      screen.getByLabelText('breakpoints.hitCountLabel') as HTMLInputElement,
      { target: { value: '0' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.saveBreakpoint' }));

    expect(screen.getByText('breakpoints.hitCountInvalid')).toBeInTheDocument();
    expect(
      screen.getByTestId(`breakpoint-editor-${BP_ID}`)
    ).toBeInTheDocument();
    expect(useDebuggerStore.getState().breakpoints.get(BP_ID)?.hitCondition).toBeUndefined();
  });

  test('engine condition error renders inline as data and keeps the editor open', async () => {
    addBp();
    evaluateExpression.mockResolvedValue({
      ok: false,
      error: "Unknown variable 'count'",
    });
    render(<BreakpointPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.editBreakpoint' }));
    const editor = screen.getByTestId(`breakpoint-editor-${BP_ID}`);
    fireEvent.change(editor.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'count > 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.saveBreakpoint' }));

    await waitFor(() => {
      expect(evaluateExpression).toHaveBeenCalled();
    });
    expect(screen.getByText('breakpoints.engineConditionError')).toBeInTheDocument();
    expect(
      screen.getByTestId(`breakpoint-editor-${BP_ID}`)
    ).toBeInTheDocument();
  });

  test('engine offline (throw) still saves without crashing', async () => {
    addBp();
    evaluateExpression.mockRejectedValue(new Error('Not connected to Python engine'));
    render(<BreakpointPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.editBreakpoint' }));
    const editor = screen.getByTestId(`breakpoint-editor-${BP_ID}`);
    fireEvent.change(editor.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'count > 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.saveBreakpoint' }));

    await waitFor(() => {
      expect(
        useDebuggerStore.getState().breakpoints.get(BP_ID)?.condition
      ).toBe('count > 3');
    });
  });

  test('cancel discards edits', async () => {
    addBp({ condition: 'count > 3' });
    render(<BreakpointPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.editBreakpoint' }));
    const editor = screen.getByTestId(`breakpoint-editor-${BP_ID}`);
    fireEvent.change(editor.querySelector('textarea') as HTMLTextAreaElement, {
      target: { value: 'changed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'breakpoints.cancelEditBreakpoint' }));

    expect(
      useDebuggerStore.getState().breakpoints.get(BP_ID)?.condition
    ).toBe('count > 3');
    expect(
      screen.queryByTestId(`breakpoint-editor-${BP_ID}`)
    ).not.toBeInTheDocument();
  });
});
