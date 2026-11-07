import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { WithBreakpoint } from './withBreakpoint';
import { useDebuggerStore } from '../../../stores/debuggerStore';
import type { Breakpoint } from '../../../types/engine';

const addBp = (overrides: Partial<Breakpoint> = {}) => {
  const bp: Breakpoint = {
    id: 'bp-node1',
    file: 'node1',
    line: 0,
    nodeId: 'node1',
    enabled: true,
    ...overrides,
  };
  useDebuggerStore.getState().addBreakpoint(bp);
};

describe('WithBreakpoint conditional badge (issue #867)', () => {
  beforeEach(() => {
    useDebuggerStore.persist.clearStorage();
    const state = useDebuggerStore.getState();
    state.reset();
    state.clearBreakpoints();
  });

  afterEach(() => {
    cleanup();
  });

  test('plain breakpoint renders the red dot with the plain tooltip', () => {
    addBp();
    const { container } = render(
      <WithBreakpoint nodeId="node1">
        <div>child</div>
      </WithBreakpoint>
    );
    const badge = container.querySelector('div[title="breakpoints.breakpointSet"]');
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain('bg-ui-danger');
  });

  test('conditional breakpoint renders the amber dot with the condition tooltip', () => {
    addBp({ condition: 'count > 3', hitCondition: '5' });
    const { container } = render(
      <WithBreakpoint nodeId="node1">
        <div>child</div>
      </WithBreakpoint>
    );
    const badge = container.querySelector(
      'div[title="breakpoints.conditionalBreakpointSet"]'
    );
    expect(badge).not.toBeNull();
    expect(badge?.className).toContain('bg-ui-warning');
  });

  test('hit-count-only breakpoint also counts as conditional', () => {
    addBp({ hitCondition: '5' });
    const { container } = render(
      <WithBreakpoint nodeId="node1">
        <div>child</div>
      </WithBreakpoint>
    );
    expect(
      container.querySelector('div[title="breakpoints.conditionalBreakpointSet"]')
    ).not.toBeNull();
  });

  test('no breakpoint renders no badge', () => {
    const { container } = render(
      <WithBreakpoint nodeId="node1">
        <div>child</div>
      </WithBreakpoint>
    );
    expect(container.querySelector('div[title]')).toBeNull();
  });
});
