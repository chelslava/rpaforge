import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useExecutionHistoryStore } from './executionHistoryStore';

describe('executionHistoryStore', () => {
  beforeEach(() => {
    useExecutionHistoryStore.getState().clearHistory();
  });

  test('startExecution creates entry with running status, correct processName, UUID-like id', () => {
    const id = useExecutionHistoryStore.getState().startExecution('Test Process');

    const state = useExecutionHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].id).toBe(id);
    expect(state.history[0].processName).toBe('Test Process');
    expect(state.history[0].status).toBe('running');
    expect(state.history[0].endTime).toBeNull();
    expect(state.history[0].duration).toBeNull();
    expect(state.history[0].activitiesExecuted).toBe(0);
    expect(state.history[0].errorMessage).toBeUndefined();
    expect(state.currentExecution?.id).toBe(id);
  });

  test('endExecution sets status, endTime, computes duration correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    const id = useExecutionHistoryStore.getState().startExecution('Test Process');

    vi.setSystemTime(new Date('2026-01-01T10:00:05.500Z'));
    useExecutionHistoryStore.getState().endExecution(id, 'completed');

    const state = useExecutionHistoryStore.getState();
    expect(state.history[0].status).toBe('completed');
    expect(state.history[0].endTime).toEqual(new Date('2026-01-01T10:00:05.500Z'));
    expect(state.history[0].duration).toBe(5500);
    expect(state.currentExecution).toBeNull();
  });

  test('full lifecycle: startExecution -> endExecution', () => {
    const id = useExecutionHistoryStore.getState().startExecution('My Process');

    useExecutionHistoryStore.getState().endExecution(id, 'failed', 'Error message');

    const state = useExecutionHistoryStore.getState();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].id).toBe(id);
    expect(state.history[0].processName).toBe('My Process');
    expect(state.history[0].status).toBe('failed');
    expect(state.history[0].errorMessage).toBe('Error message');
    expect(state.currentExecution).toBeNull();
  });

  test('recordActivityStart adds activity record to execution', () => {
    const execId = useExecutionHistoryStore.getState().startExecution('Process');

    const activityId = useExecutionHistoryStore.getState().recordActivityStart(
      execId,
      'Log',
      'Start',
      'start-node'
    );

    const state = useExecutionHistoryStore.getState();
    const activities = state.getExecutionActivities(execId);
    expect(activities).toHaveLength(1);
    expect(activities[0].id).toBe(activityId);
    expect(activities[0].executionId).toBe(execId);
    expect(activities[0].activityName).toBe('Log');
    expect(activities[0].nodeName).toBe('Start');
    expect(activities[0].nodeId).toBe('start-node');
    expect(activities[0].status).toBe('running');
    expect(activities[0].endTime).toBeNull();
    expect(activities[0].duration).toBeNull();
  });

  test('recordActivityEnd updates status, duration, and increments activitiesExecuted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    const execId = useExecutionHistoryStore.getState().startExecution('Process');

    const activityId = useExecutionHistoryStore.getState().recordActivityStart(
      execId,
      'Set Variable',
      'SetVar',
      'setvar-node'
    );

    vi.setSystemTime(new Date('2026-01-01T10:00:02.300Z'));
    useExecutionHistoryStore.getState().recordActivityEnd(activityId, 'success', 'value', undefined);

    const state = useExecutionHistoryStore.getState();
    const activities = state.getExecutionActivities(execId);
    expect(activities[0].status).toBe('success');
    expect(activities[0].duration).toBe(2300);
    expect(activities[0].output).toBe('value');
    expect(state.history[0].activitiesExecuted).toBe(1);
  });

  test('full lifecycle: start exec -> recordActivityStart -> recordActivityEnd -> endExecution', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    const execId = useExecutionHistoryStore.getState().startExecution('Full Process');

    vi.setSystemTime(new Date('2026-01-01T10:00:01.000Z'));
    const activityId = useExecutionHistoryStore.getState().recordActivityStart(
      execId,
      'Log',
      'Log',
      'log-node'
    );

    vi.setSystemTime(new Date('2026-01-01T10:00:03.500Z'));
    useExecutionHistoryStore.getState().recordActivityEnd(activityId, 'success', 'Hello');

    vi.setSystemTime(new Date('2026-01-01T10:00:10.000Z'));
    useExecutionHistoryStore.getState().endExecution(execId, 'completed');

    const state = useExecutionHistoryStore.getState();
    const historyEntry = state.history[0];
    const activities = state.getExecutionActivities(execId);

    expect(historyEntry.id).toBe(execId);
    expect(historyEntry.processName).toBe('Full Process');
    expect(historyEntry.status).toBe('completed');
    expect(historyEntry.duration).toBe(10000);
    expect(historyEntry.activitiesExecuted).toBe(1);

    expect(activities).toHaveLength(1);
    expect(activities[0].activityName).toBe('Log');
    expect(activities[0].status).toBe('success');
    expect(activities[0].duration).toBe(2500);
    expect(activities[0].output).toBe('Hello');
    expect(state.currentExecution).toBeNull();
  });

  test('getExecutionActivities returns records for a given execution ID', () => {
    const execId = useExecutionHistoryStore.getState().startExecution('Multi Activity');

    const act1 = useExecutionHistoryStore.getState().recordActivityStart(execId, 'Activity 1', 'N1', 'n1');
    const act2 = useExecutionHistoryStore.getState().recordActivityStart(execId, 'Activity 2', 'N2', 'n2');
    useExecutionHistoryStore.getState().recordActivityStart('fake-id', 'Other', 'N3', 'n3');

    const state = useExecutionHistoryStore.getState();
    const activities = state.getExecutionActivities(execId);

    expect(activities).toHaveLength(2);
    expect(activities[0].id).toBe(act1);
    expect(activities[1].id).toBe(act2);
  });

  test('maxHistorySize enforcement (old entries dropped)', () => {
    const store = useExecutionHistoryStore.getState();

    for (let i = 0; i < 105; i++) {
      const id = store.startExecution(`Process ${i}`);
      store.endExecution(id, 'completed');
    }

    const state = useExecutionHistoryStore.getState();
    expect(state.history).toHaveLength(100);
    expect(state.history[0].processName).toBe('Process 104');
    expect(state.history[99].processName).toBe('Process 5');
  });

  test('clearHistory resets everything', () => {
    const store = useExecutionHistoryStore.getState();

    const id = store.startExecution('Process');
    const actId = store.recordActivityStart(id, 'Act', 'Node', 'node');
    store.recordActivityEnd(actId, 'success');
    store.endExecution(id, 'completed');

    useExecutionHistoryStore.getState().clearHistory();

    const state = useExecutionHistoryStore.getState();
    expect(state.history).toHaveLength(0);
    expect(state.activityRecords.size).toBe(0);
    expect(state.currentExecution).toBeNull();
  });
});
