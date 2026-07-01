import { beforeEach, describe, expect, test } from 'vitest';
import type { Breakpoint, CallFrame, Variable } from '../types/engine';
import { useDebuggerStore } from './debuggerStore';

beforeEach(() => {
  useDebuggerStore.persist.clearStorage();
  const state = useDebuggerStore.getState();
  state.reset();
  // breakpoints/fileBreakpoints not cleared by reset()
  state.clearBreakpoints();
  state.clearWatchedVariables();
});

describe('debuggerStore', () => {
  const addBp = (bp: Breakpoint) =>
    useDebuggerStore.getState().addBreakpoint(bp);
  const get = () => useDebuggerStore.getState();

  test('addBreakpoint adds breakpoint and syncs fileBreakpoints', () => {
    const bp: Breakpoint = {
      id: 'bp1', file: 'f1.robot', line: 5, nodeId: 'node1', enabled: true,
    };
    addBp(bp);
    expect(get().breakpoints.get('bp1')).toEqual(bp);
    expect(get().fileBreakpoints.get('f1.robot')).toEqual(['bp1']);
  });

  test('removeBreakpoint removes breakpoint and updates fileBreakpoints', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    addBp({ id: 'bp2', file: 'f1.robot', line: 10, enabled: true });
    get().removeBreakpoint('bp1');
    expect(get().breakpoints.has('bp1')).toBe(false);
    expect(get().breakpoints.has('bp2')).toBe(true);
    expect(get().fileBreakpoints.get('f1.robot')).toEqual(['bp2']);
  });

  test('toggleBreakpoint toggles enabled flag', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    get().toggleBreakpoint('bp1');
    expect(get().breakpoints.get('bp1')?.enabled).toBe(false);
    get().toggleBreakpoint('bp1');
    expect(get().breakpoints.get('bp1')?.enabled).toBe(true);
  });

  test('updateBreakpoint updates fields on existing breakpoint', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    get().updateBreakpoint('bp1', { line: 10, condition: 'x > 0' });
    const updated = get().breakpoints.get('bp1');
    expect(updated?.line).toBe(10);
    expect(updated?.condition).toBe('x > 0');
  });

  test('updateBreakpoint does nothing for unknown id', () => {
    get().updateBreakpoint('nonexistent', { condition: 'x' });
    expect(get().breakpoints.size).toBe(0);
  });

  test('clearBreakpoints removes all breakpoints', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    addBp({ id: 'bp2', file: 'f2.robot', line: 5, enabled: true });
    get().clearBreakpoints();
    expect(get().breakpoints.size).toBe(0);
    expect(get().fileBreakpoints.size).toBe(0);
  });

  test('clearBreakpoints scoped to file removes only that file entries', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    addBp({ id: 'bp2', file: 'f2.robot', line: 5, enabled: true });
    get().clearBreakpoints('f1.robot');
    expect(get().breakpoints.has('bp1')).toBe(false);
    expect(get().breakpoints.has('bp2')).toBe(true);
    expect(get().fileBreakpoints.has('f1.robot')).toBe(false);
    expect(get().fileBreakpoints.get('f2.robot')?.length).toBe(1);
  });

  test('getBreakpointsForFile returns only breakpoints for that file', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    addBp({ id: 'bp2', file: 'f1.robot', line: 10, enabled: true });
    addBp({ id: 'bp3', file: 'f2.robot', line: 5, enabled: true });
    expect(get().getBreakpointsForFile('f1.robot')).toHaveLength(2);
    expect(get().getBreakpointsForFile('f2.robot')).toHaveLength(1);
    expect(get().getBreakpointsForFile('unknown.robot')).toHaveLength(0);
  });

  test('cleanupStaleBreakpoints removes breakpoints whose nodeId is not in valid set', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, nodeId: 'node1', enabled: true });
    addBp({ id: 'bp2', file: 'f1.robot', line: 10, nodeId: 'node2', enabled: true });
    addBp({ id: 'bp3', file: 'f2.robot', line: 5, nodeId: 'node3', enabled: true });
    get().cleanupStaleBreakpoints(new Set(['node1']));
    expect(get().breakpoints.has('bp1')).toBe(true);
    expect(get().breakpoints.has('bp2')).toBe(false);
    expect(get().breakpoints.has('bp3')).toBe(false);
    expect(get().fileBreakpoints.get('f1.robot')).toEqual(['bp1']);
    expect(get().fileBreakpoints.has('f2.robot')).toBe(false);
  });

  test('setVariables replaces variables array', () => {
    const vars: Variable[] = [
      { name: 'x', value: 1, type: 'int' },
      { name: 'y', value: 'hello', type: 'string' },
    ];
    get().setVariables(vars);
    expect(get().variables).toEqual(vars);
    const newVars: Variable[] = [{ name: 'z', value: true, type: 'bool' }];
    get().setVariables(newVars);
    expect(get().variables).toHaveLength(1);
    expect(get().variables[0].name).toBe('z');
  });

  test('updateVariable updates value by name', () => {
    get().setVariables([{ name: 'x', value: 1, type: 'int' }]);
    get().updateVariable('x', 42);
    expect(get().variables.find((v: Variable) => v.name === 'x')?.value).toBe(42);
  });

  test('updateVariable on non-existent name does nothing', () => {
    const vars: Variable[] = [{ name: 'x', value: 1, type: 'int' }];
    get().setVariables(vars);
    get().updateVariable('nonexistent', 'value');
    expect(get().variables).toEqual(vars);
  });

  test('addWatchedVariable adds string name to set', () => {
    get().addWatchedVariable('x');
    get().addWatchedVariable('y');
    expect(get().watchedVariables.has('x')).toBe(true);
    expect(get().watchedVariables.has('y')).toBe(true);
    expect(get().watchedVariables.size).toBe(2);
  });

  test('addWatchedVariable deduplicates', () => {
    get().addWatchedVariable('x');
    get().addWatchedVariable('x');
    expect(get().watchedVariables.size).toBe(1);
  });

  test('removeWatchedVariable removes by name', () => {
    get().addWatchedVariable('x');
    get().addWatchedVariable('y');
    get().removeWatchedVariable('x');
    expect(get().watchedVariables.has('x')).toBe(false);
    expect(get().watchedVariables.has('y')).toBe(true);
  });

  test('clearWatchedVariables empties set', () => {
    get().addWatchedVariable('x');
    get().addWatchedVariable('y');
    get().clearWatchedVariables();
    expect(get().watchedVariables.size).toBe(0);
  });

  test('setCallStack replaces call stack', () => {
    const frames: CallFrame[] = [
      { activity: 'Log', library: 'BuiltIn', line: 3, nodeId: 'node1' },
      { activity: 'Set Variable', library: 'BuiltIn', line: 5, nodeId: 'node2' },
    ];
    get().setCallStack(frames);
    expect(get().callStack).toEqual(frames);
  });

  test('clearCallStack empties call stack', () => {
    get().setCallStack([{ activity: 'Log', library: 'BuiltIn', line: 3, nodeId: 'node1' }]);
    get().clearCallStack();
    expect(get().callStack).toHaveLength(0);
  });

  test('setCurrentPosition sets file and line', () => {
    get().setCurrentPosition('f1.robot', 5);
    expect(get().currentFile).toBe('f1.robot');
    expect(get().currentLine).toBe(5);
  });

  test('setCurrentPosition with null clears position', () => {
    get().setCurrentPosition('f1.robot', 5);
    get().setCurrentPosition(null, null);
    expect(get().currentFile).toBeNull();
    expect(get().currentLine).toBeNull();
  });

  test('setPaused sets isPaused flag', () => {
    expect(get().isPaused).toBe(false);
    get().setPaused(true);
    expect(get().isPaused).toBe(true);
    get().setPaused(false);
    expect(get().isPaused).toBe(false);
  });

  test('setStepping sets isStepping flag', () => {
    expect(get().isStepping).toBe(false);
    get().setStepping(true);
    expect(get().isStepping).toBe(true);
  });

  test('setStepLoading sets isStepLoading flag', () => {
    expect(get().isStepLoading).toBe(false);
    get().setStepLoading(true);
    expect(get().isStepLoading).toBe(true);
  });

  test('setLastBreakpointId stores last breakpoint id', () => {
    get().setLastBreakpointId('bp1');
    expect(get().lastBreakpointId).toBe('bp1');
    get().setLastBreakpointId(null);
    expect(get().lastBreakpointId).toBeNull();
  });

  test('reset clears debug session state but preserves breakpoints', () => {
    addBp({ id: 'bp1', file: 'f1.robot', line: 5, enabled: true });
    get().setVariables([{ name: 'x', value: 1, type: 'int' }]);
    get().setCallStack([{ activity: 'Log', library: 'BuiltIn', line: 3, nodeId: 'node1' }]);
    get().setPaused(true);
    get().setStepping(true);
    get().setStepLoading(true);
    get().setLastBreakpointId('bp1');
    get().reset();
    // reset() intentionally does not clear breakpoints (persisted across sessions)
    expect(get().breakpoints.size).toBe(1);
    expect(get().fileBreakpoints.size).toBe(1);
    expect(get().variables).toHaveLength(0);
    expect(get().callStack).toHaveLength(0);
    expect(get().isPaused).toBe(false);
    expect(get().isStepping).toBe(false);
    expect(get().isStepLoading).toBe(false);
    expect(get().lastBreakpointId).toBeNull();
    expect(get().connectionState).toBe('disconnected');
  });
});
