import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useVariableStore } from './variableStore';
import type { ProcessVariable } from './variableStore';
describe('variableStore', () => {
  const projectId = 'test-project-1';
  const diagramId = 'diagram-1';

  const baseDef = {
    name: 'var1', type: 'string' as const, value: '', scope: 'process' as const,
    description: 'Test variable',
  } as const;

  beforeEach(() => {
    useVariableStore.persist.clearStorage();
    useVariableStore.getState().clearVariables();
  });

  test('addVariable with scope=process ignores diagramId', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, scope: 'process' }, projectId);

    const saved = store.getVariablesByProject(projectId);
    expect(saved).toHaveLength(1);
    expect(saved[0].diagramId).toBeUndefined();
  });

  test('addVariable with scope=task auto-sets diagramId', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, scope: 'task' }, projectId, diagramId);

    const saved = store.getVariablesByProject(projectId);
    expect(saved).toHaveLength(1);
    expect(saved[0].diagramId).toBe(diagramId);
  });

  test('addVariable without diagramId for task scope leaves it undefined', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, scope: 'task' }, projectId);

    const saved = store.getVariablesByProject(projectId);
    expect(saved).toHaveLength(1);
    expect(saved[0].diagramId).toBeUndefined();
  });

  test('getVariable resolves combined project+diagram lookup', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, name: 'procVar', scope: 'process' }, projectId);
    store.addVariable({ ...baseDef, name: 'taskVar', scope: 'task' }, projectId, diagramId);

    const found = store.getVariable('procVar', projectId, diagramId);
    expect(found).toBeDefined();
    expect(found!.scope).toBe('process');

    const taskVar = store.getVariable('taskVar', projectId, diagramId);
    expect(taskVar).toBeDefined();
    expect(taskVar!.scope).toBe('task');
  });

  test('getVariable returns undefined for non-existent variable', () => {
    const store = useVariableStore.getState();
    expect(store.getVariable('nonexistent', projectId)).toBeUndefined();
  });

  test('updateVariable updates fields and bumps updatedAt', () => {
    const store = useVariableStore.getState();
    const v = store.addVariable({ ...baseDef, name: 'myVar' }, projectId);
    const before = v.updatedAt;

    store.updateVariable(v.id, { description: 'New desc' });
    const updated = store.getVariable('myVar', projectId);
    expect(updated!.description).toBe('New desc');
    expect(updated!.updatedAt).not.toBe(before);
  });

  test('removeVariable removes by id', () => {
    const store = useVariableStore.getState();
    const v = store.addVariable(baseDef, projectId);
    store.removeVariable(v.id);
    expect(store.getVariablesByProject(projectId)).toHaveLength(0);
  });

  test('getVariablesByProject isolates projects', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, name: 'a' }, 'project-A');
    store.addVariable({ ...baseDef, name: 'b' }, 'project-B');
    expect(store.getVariablesByProject('project-A')).toHaveLength(1);
    expect(store.getVariablesByProject('project-B')).toHaveLength(1);
    expect(store.getVariablesByProject('project-C')).toHaveLength(0);
  });

  test('getVariablesByDiagram returns process-scope + matching diagram-scope vars', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, name: 'proc', scope: 'process' }, projectId);
    store.addVariable({ ...baseDef, name: 'diag', scope: 'task' }, projectId, diagramId);
    store.addVariable({ ...baseDef, name: 'other', scope: 'task' }, projectId, 'other-diagram');

    const vars = store.getVariablesByDiagram(projectId, diagramId);
    const names = vars.map((v: ProcessVariable) => v.name);
    expect(names).toContain('proc');
    expect(names).toContain('diag');
    expect(names).not.toContain('other');
  });

  test('getVariablesByScope filters by scope', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, name: 'p', scope: 'process' }, projectId);
    store.addVariable({ ...baseDef, name: 't', scope: 'task' }, projectId, diagramId);

    expect(store.getVariablesByScope(projectId, 'process')).toHaveLength(1);
    expect(store.getVariablesByScope(projectId, 'task', diagramId)).toHaveLength(1);
    expect(store.getVariablesByScope(projectId, 'task', 'other-diagram')).toHaveLength(0);
  });

  test('loadVariables replaces all vars for project, keeps others', () => {
    const store = useVariableStore.getState();
    store.addVariable({ ...baseDef, name: 'old' }, projectId);
    store.addVariable({ ...baseDef, name: 'keep' }, 'other-project');

    store.loadVariables(projectId, [
      { name: 'new1', type: 'string', value: '', scope: 'process' },
      { name: 'new2', type: 'number', value: '0', scope: 'process' },
    ]);

    expect(store.getVariablesByProject(projectId)).toHaveLength(2);
    expect(store.getVariablesByProject('other-project')).toHaveLength(1);
    expect(store.getVariable('old', projectId)).toBeUndefined();
  });

  test('clearVariables removes all', () => {
    const store = useVariableStore.getState();
    store.addVariable(baseDef, projectId);
    store.addVariable(baseDef, 'other-p');
    store.clearVariables();
    expect(store.variables.length).toBe(0);
  });

  test('clearProjectVariables clears only one project', () => {
    const store = useVariableStore.getState();
    store.addVariable(baseDef, projectId);
    store.addVariable(baseDef, 'other-p');
    store.clearProjectVariables(projectId);
    expect(store.getVariablesByProject(projectId)).toHaveLength(0);
    expect(store.getVariablesByProject('other-p')).toHaveLength(1);
  });

  test('cleanStaleProjects removes vars older than maxAgeDays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
    const store = useVariableStore.getState();
    localStorage.removeItem('rpaforge-variables-cleanup');
    store.addVariable({ ...baseDef, name: 'stale' }, projectId);
    store.addVariable({ ...baseDef, name: 'fresh' }, projectId);
    const idx = store.variables.findIndex((v: ProcessVariable) => v.name === 'stale');
    if (idx !== -1) store.variables[idx].createdAt = '2025-01-01T00:00:00.000Z';
    store.cleanStaleProjects(180);
    expect(store.getVariable('stale', projectId)).toBeUndefined();
    expect(store.getVariable('fresh', projectId)).toBeDefined();
    vi.useRealTimers();
  });

  test('cleanStaleProjects does nothing when guard says skip', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
    const store = useVariableStore.getState();
    store.addVariable(baseDef, projectId);
    store.cleanStaleProjects(180);
    expect(store.getVariablesByProject(projectId)).toHaveLength(1);
    vi.useRealTimers();
  });
});
