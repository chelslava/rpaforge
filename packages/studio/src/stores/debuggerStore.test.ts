import { beforeEach, describe, expect, test } from 'vitest';
import type { Breakpoint, CallFrame, Variable } from '../types/engine';
import { useDebuggerStore } from './debuggerStore';

beforeEach(() => {
  useDebuggerStore.persist.clearStorage();
  useDebuggerStore.getState().reset();
});

describe('debuggerStore', () => {
  test('addBreakpoint adds breakpoint and syncs fileBreakpoints', () => {
    const store = useDebuggerStore.getState();
    const bp: Breakpoint = {
      id: 'bp1', file: 'f1.robot', line: 5, nodeId: 'node1', enabled: true,
    };
    store.addBreakpoint(bp);
    expect(store.breakpoints.get('bp1')).toEqual(bp);
    expect(store.fileBreakpoints.get('f1.robot')).toEqual(['bp1']);
  });

  test('removeBreakpoint removes breakpoint and updates fileBreakpoints', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.addBreakpoint({ id: 'bp2', file: 'f1.robot', line: 10, enabled: true });
    store.removeBreakpoint('bp1');
    expect(store.breakpoints.has('bp1')).toBe(false);
    expect(store.breakpoints.has('bp2')).toBe(true);
    expect(store.fileBreakpoints.get('f1.robot')).toEqual(['bp2']);
  });

  test('toggleBreakpoint toggles enabled flag', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.toggleBreakpoint('bp1');
    expect(store.breakpoints.get('bp1')?.enabled).toBe(false);
    store.toggleBreakpoint('bp1');
    expect(store.breakpoints.get('bp1')?.enabled).toBe(true);
  });

  test('updateBreakpoint updates fields on existing breakpoint', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.updateBreakpoint('bp1', { line: 10, condition: 'x > 0' });
    const updated = store.breakpoints.get('bp1');
    expect(updated?.line).toBe(10);
    expect(updated?.condition).toBe('x > 0');
  });

  test('updateBreakpoint does nothing for unknown id', () => {
    const store = useDebuggerStore.getState();
    store.updateBreakpoint('nonexistent', { condition: 'x' });
    expect(store.breakpoints.size).toBe(0);
  });

  test('clearBreakpoints removes all breakpoints', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.addBreakpoint({ id: 'bp2', file: 'f2.robot', line: 5, enabled: true });
    store.clearBreakpoints();
    expect(store.breakpoints.size).toBe(0);
    expect(store.fileBreakpoints.size).toBe(0);
  });

  test('clearBreakpoints scoped to file removes only that file entries', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.addBreakpoint({ id: 'bp2', file: 'f2.robot', line: 5, enabled: true });
    store.clearBreakpoints('f1.robot');
    expect(store.breakpoints.has('bp1')).toBe(false);
    expect(store.breakpoints.has('bp2')).toBe(true);
    expect(store.fileBreakpoints.has('f1.robot')).toBe(false);
    expect(store.fileBreakpoints.get('f2.robot')?.length).toBe(1);
  });

  test('getBreakpointsForFile returns only breakpoints for that file', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.addBreakpoint({ id: 'bp2', file: 'f1.robot', line: 10, enabled: true });
    store.addBreakpoint({ id: 'bp3', file: 'f2.robot', line: 5, enabled: true });
    expect(store.getBreakpointsForFile('f1.robot')).toHaveLength(2);
    expect(store.getBreakpointsForFile('f2.robot')).toHaveLength(1);
    expect(store.getBreakpointsForFile('unknown.robot')).toHaveLength(0);
  });

  test('cleanupStaleBreakpoints removes breakpoints whose nodeId is not in valid set', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, nodeId: 'node1', enabled: true });
    store.addBreakpoint({ id: 'bp2', file: 'f1.robot', line: 10, nodeId: 'node2', enabled: true });
    store.addBreakpoint({ id: 'bp3', file: 'f2.robot', line: 5, nodeId: 'node3', enabled: true });
    store.cleanupStaleBreakpoints(new Set(['node1']));
    expect(store.breakpoints.has('bp1')).toBe(true);
    expect(store.breakpoints.has('bp2')).toBe(false);
    expect(store.breakpoints.has('bp3')).toBe(false);
    expect(store.fileBreakpoints.get('f1.robot')).toEqual(['bp1']);
    expect(store.fileBreakpoints.has('f2.robot')).toBe(false);
  });

  test('setVariables replaces variables array', () => {
    const store = useDebuggerStore.getState();
    const vars: Variable[] = [
      { name: 'x', value: 1, type: 'int' },
      { name: 'y', value: 'hello', type: 'string' },
    ];
    store.setVariables(vars);
    expect(store.variables).toEqual(vars);
    const newVars: Variable[] = [{ name: 'z', value: true, type: 'bool' }];
    store.setVariables(newVars);
    expect(store.variables).toHaveLength(1);
    expect(store.variables[0].name).toBe('z');
  });

  test('updateVariable updates value by name', () => {
    const store = useDebuggerStore.getState();
    store.setVariables([{ name: 'x', value: 1, type: 'int' }]);
    store.updateVariable('x', 42);
    expect(store.variables.find((v: Variable) => v.name === 'x')?.value).toBe(42);
  });

  test('updateVariable on non-existent name does nothing', () => {
    const store = useDebuggerStore.getState();
    const vars: Variable[] = [{ name: 'x', value: 1, type: 'int' }];
    store.setVariables(vars);
    store.updateVariable('nonexistent', 'value');
    expect(store.variables).toEqual(vars);
  });

  test('addWatchedVariable adds string name to set', () => {
    const store = useDebuggerStore.getState();
    store.addWatchedVariable('x');
    store.addWatchedVariable('y');
    expect(store.watchedVariables.has('x')).toBe(true);
    expect(store.watchedVariables.has('y')).toBe(true);
    expect(store.watchedVariables.size).toBe(2);
  });

  test('addWatchedVariable deduplicates', () => {
    const store = useDebuggerStore.getState();
    store.addWatchedVariable('x');
    store.addWatchedVariable('x');
    expect(store.watchedVariables.size).toBe(1);
  });

  test('removeWatchedVariable removes by name', () => {
    const store = useDebuggerStore.getState();
    store.addWatchedVariable('x');
    store.addWatchedVariable('y');
    store.removeWatchedVariable('x');
    expect(store.watchedVariables.has('x')).toBe(false);
    expect(store.watchedVariables.has('y')).toBe(true);
  });

  test('clearWatchedVariables empties set', () => {
    const store = useDebuggerStore.getState();
    store.addWatchedVariable('x');
    store.addWatchedVariable('y');
    store.clearWatchedVariables();
    expect(store.watchedVariables.size).toBe(0);
  });

  test('setCallStack replaces call stack', () => {
    const store = useDebuggerStore.getState();
    const frames: CallFrame[] = [
      { activity: 'Log', library: 'BuiltIn', line: 3, nodeId: 'node1' },
      { activity: 'Set Variable', library: 'BuiltIn', line: 5, nodeId: 'node2' },
    ];
    store.setCallStack(frames);
    expect(store.callStack).toEqual(frames);
  });

  test('clearCallStack empties call stack', () => {
    const store = useDebuggerStore.getState();
    store.setCallStack([{ activity: 'Log', library: 'BuiltIn', line: 3, nodeId: 'node1' }]);
    store.clearCallStack();
    expect(store.callStack).toHaveLength(0);
  });

  test('setCurrentPosition sets file and line', () => {
    const store = useDebuggerStore.getState();
    store.setCurrentPosition('f1.robot', 5);
    expect(store.currentFile).toBe('f1.robot');
    expect(store.currentLine).toBe(5);
  });

  test('setCurrentPosition with null clears position', () => {
    const store = useDebuggerStore.getState();
    store.setCurrentPosition('f1.robot', 5);
    store.setCurrentPosition(null, null);
    expect(store.currentFile).toBeNull();
    expect(store.currentLine).toBeNull();
  });

  test('setPaused sets isPaused flag', () => {
    const store = useDebuggerStore.getState();
    expect(store.isPaused).toBe(false);
    store.setPaused(true);
    expect(store.isPaused).toBe(true);
    store.setPaused(false);
    expect(store.isPaused).toBe(false);
  });

  test('setStepping sets isStepping flag', () => {
    const store = useDebuggerStore.getState();
    expect(store.isStepping).toBe(false);
    store.setStepping(true);
    expect(store.isStepping).toBe(true);
  });

  test('setStepLoading sets isStepLoading flag', () => {
    const store = useDebuggerStore.getState();
    expect(store.isStepLoading).toBe(false);
    store.setStepLoading(true);
    expect(store.isStepLoading).toBe(true);
  });

  test('setLastBreakpointId stores last breakpoint id', () => {
    const store = useDebuggerStore.getState();
    store.setLastBreakpointId('bp1');
    expect(store.lastBreakpointId).toBe('bp1');
    store.setLastBreakpointId(null);
    expect(store.lastBreakpointId).toBeNull();
  });

  test('reset clears all debugger state', () => {
    const store = useDebuggerStore.getState();
    store.addBreakpoint({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    store.setVariables([{ name: 'x', value: 1, type: 'int' }]);
    store.setCallStack([{ activity: 'Log', library: 'BuiltIn', line: 3, nodeId: 'node1' }]);
    store.setPaused(true);
    store.setStepping(true);
    store.setStepLoading(true);
    store.setLastBreakpointId('bp1');
    store.reset();
    expect(store.breakpoints.size).toBe(0);
    expect(store.fileBreakpoints.size).toBe(0);
    expect(store.variables).toHaveLength(0);
    expect(store.callStack).toHaveLength(0);
    expect(store.isPaused).toBe(false);
    expect(store.isStepping).toBe(false);
    expect(store.isStepLoading).toBe(false);
    expect(store.lastBreakpointId).toBeNull();
    expect(store.connectionState).toBe('disconnected');
  });

  test('persist merge restores breakpoints and fileBreakpoints from saved Array shape', () => {
    const saved = {
      breakpoints: [
        ['bp1', { id: 'bp1', file: 'f1.robot', line: 5, enabled: true }],
        ['bp2', { id: 'bp2', file: 'f2.robot', line: 10, nodeId: 'node2', enabled: false }],
      ],
      fileBreakpoints: [['f1.robot', ['bp1']], ['f2.robot', ['bp2']]],
    };
    useDebuggerStore.persist.merge(saved);
    const state = useDebuggerStore.getState();
    expect(state.breakpoints.get('bp1')?.file).toBe('f1.robot');
    expect(state.breakpoints.get('bp2')?.enabled).toBe(false);
    expect(state.fileBreakpoints.get('f1.robot')).toEqual(['bp1']);
    expect(state.fileBreakpoints.get('f2.robot')).toEqual(['bp2']);
  });
});
