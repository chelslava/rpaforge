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

  const get = () => useVariableStore.getState();

  test('addVariable with scope=process ignores diagramId', () => {
    get().addVariable({ ...baseDef, scope: 'process' }, projectId);
    const saved = get().getVariablesByProject(projectId);
    expect(saved).toHaveLength(1);
    expect(saved[0].diagramId).toBeUndefined();
  });

  test('addVariable with scope=task auto-sets diagramId', () => {
    get().addVariable({ ...baseDef, scope: 'task' }, projectId, diagramId);
    const saved = get().getVariablesByProject(projectId);
    expect(saved).toHaveLength(1);
    expect(saved[0].diagramId).toBe(diagramId);
  });

  test('addVariable without diagramId for task scope leaves it undefined', () => {
    get().addVariable({ ...baseDef, scope: 'task' }, projectId);
    const saved = get().getVariablesByProject(projectId);
    expect(saved).toHaveLength(1);
    expect(saved[0].diagramId).toBeUndefined();
  });

  test('getVariable resolves combined project+diagram lookup', () => {
    get().addVariable({ ...baseDef, name: 'procVar', scope: 'process' }, projectId);
    get().addVariable({ ...baseDef, name: 'taskVar', scope: 'task' }, projectId, diagramId);

    const found = get().getVariable('procVar', projectId, diagramId);
    expect(found).toBeDefined();
    expect(found!.scope).toBe('process');

    const taskVar = get().getVariable('taskVar', projectId, diagramId);
    expect(taskVar).toBeDefined();
    expect(taskVar!.scope).toBe('task');
  });

  test('getVariable returns undefined for non-existent variable', () => {
    expect(get().getVariable('nonexistent', projectId)).toBeUndefined();
  });

  test('updateVariable updates fields and bumps updatedAt', () => {
    const v = get().addVariable({ ...baseDef, name: 'myVar' }, projectId);
    const before = Date.parse(v.updatedAt);

    // ensure we cross a millisecond boundary
    const start = Date.now();
    while (Date.now() === start) {} // spin

    get().updateVariable(v.id, { description: 'New desc' });
    const updated = get().getVariable('myVar', projectId);
    expect(updated!.description).toBe('New desc');
    expect(Date.parse(updated!.updatedAt)).toBeGreaterThan(before);
  });

  test('removeVariable removes by id', () => {
    const v = get().addVariable(baseDef, projectId);
    get().removeVariable(v.id);
    expect(get().getVariablesByProject(projectId)).toHaveLength(0);
  });

  test('getVariablesByProject isolates projects', () => {
    get().addVariable({ ...baseDef, name: 'a' }, 'project-A');
    get().addVariable({ ...baseDef, name: 'b' }, 'project-B');
    expect(get().getVariablesByProject('project-A')).toHaveLength(1);
    expect(get().getVariablesByProject('project-B')).toHaveLength(1);
    expect(get().getVariablesByProject('project-C')).toHaveLength(0);
  });

  test('getVariablesByDiagram returns process-scope + matching diagram-scope vars', () => {
    get().addVariable({ ...baseDef, name: 'proc', scope: 'process' }, projectId);
    get().addVariable({ ...baseDef, name: 'diag', scope: 'task' }, projectId, diagramId);
    get().addVariable({ ...baseDef, name: 'other', scope: 'task' }, projectId, 'other-diagram');

    const vars = get().getVariablesByDiagram(projectId, diagramId);
    const names = vars.map((v: ProcessVariable) => v.name);
    expect(names).toContain('proc');
    expect(names).toContain('diag');
    expect(names).not.toContain('other');
  });

  test('getVariablesByScope filters by scope', () => {
    get().addVariable({ ...baseDef, name: 'p', scope: 'process' }, projectId);
    get().addVariable({ ...baseDef, name: 't', scope: 'task' }, projectId, diagramId);

    expect(get().getVariablesByScope(projectId, 'process')).toHaveLength(1);
    expect(get().getVariablesByScope(projectId, 'task', diagramId)).toHaveLength(1);
    expect(get().getVariablesByScope(projectId, 'task', 'other-diagram')).toHaveLength(0);
  });

  test('loadVariables replaces all vars for project, keeps others', () => {
    get().addVariable({ ...baseDef, name: 'old' }, projectId);
    get().addVariable({ ...baseDef, name: 'keep' }, 'other-project');

    get().loadVariables(projectId, [
      { id: 'var-new1', name: 'new1', type: 'string', value: '', scope: 'process', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
      { id: 'var-new2', name: 'new2', type: 'number', value: '0', scope: 'process', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
    ]);

    expect(get().getVariablesByProject(projectId)).toHaveLength(2);
    expect(get().getVariablesByProject('other-project')).toHaveLength(1);
    expect(get().getVariable('old', projectId)).toBeUndefined();
  });

  test('clearVariables removes all', () => {
    get().addVariable(baseDef, projectId);
    get().addVariable(baseDef, 'other-p');
    get().clearVariables();
    expect(get().variables.length).toBe(0);
  });

  test('clearProjectVariables clears only one project', () => {
    get().addVariable(baseDef, projectId);
    get().addVariable(baseDef, 'other-p');
    get().clearProjectVariables(projectId);
    expect(get().getVariablesByProject(projectId)).toHaveLength(0);
    expect(get().getVariablesByProject('other-p')).toHaveLength(1);
  });

  test('cleanStaleProjects removes vars older than maxAgeDays', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
    localStorage.removeItem('rpaforge-variables-cleanup');
    get().addVariable({ ...baseDef, name: 'stale' }, projectId);
    get().addVariable({ ...baseDef, name: 'fresh' }, projectId);
    const idx = get().variables.findIndex((v: ProcessVariable) => v.name === 'stale');
    if (idx !== -1) get().variables[idx].createdAt = '2025-01-01T00:00:00.000Z';
    get().cleanStaleProjects(180);
    expect(get().getVariable('stale', projectId)).toBeUndefined();
    expect(get().getVariable('fresh', projectId)).toBeDefined();
    vi.useRealTimers();
  });

  test('cleanStaleProjects does nothing when guard says skip', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));
    get().addVariable(baseDef, projectId);
    get().cleanStaleProjects(180);
    expect(get().getVariablesByProject(projectId)).toHaveLength(1);
    vi.useRealTimers();
  });
});
