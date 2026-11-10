import { describe, expect, test } from 'vitest';

import {
  analyticsToCsv,
  computeAnalytics,
  median,
  percentile95,
} from './executionAnalytics';
import type {
  ActivityExecutionRecord,
  ExecutionHistoryEntry,
} from '../stores/executionHistoryStore';

const NOW = new Date('2026-11-10T12:00:00Z');

function entry(partial: Partial<ExecutionHistoryEntry>): ExecutionHistoryEntry {
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    processName: 'Invoices',
    startTime: new Date(NOW.getTime() - 60 * 60 * 1000),
    endTime: new Date(NOW.getTime() - 59 * 60 * 1000),
    status: 'completed',
    duration: 60000,
    activitiesExecuted: 3,
    ...partial,
  };
}

function activity(partial: Partial<ActivityExecutionRecord>): ActivityExecutionRecord {
  return {
    id: `act-${Math.random().toString(36).slice(2)}`,
    executionId: 'run-1',
    activityName: 'Click Element',
    nodeName: 'node-1',
    nodeId: 'node-1',
    startTime: new Date(NOW.getTime() - 60 * 60 * 1000),
    endTime: new Date(NOW.getTime() - 59 * 60 * 1000),
    status: 'success',
    duration: 500,
    ...partial,
  };
}

describe('median / p95', () => {
  test('median handles odd/even/empty', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  test('p95 nearest-rank', () => {
    expect(percentile95([])).toBeNull();
    expect(percentile95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10);
    expect(percentile95([100, 1, 2, 3, 4])).toBe(100);
  });
});

describe('computeAnalytics', () => {
  const runs = [
    entry({ id: 'r1', status: 'completed', duration: 10000, startTime: new Date('2026-11-10T09:00:00Z') }),
    entry({ id: 'r2', status: 'failed', duration: 20000, errorMessage: 'Timeout: element not found', startTime: new Date('2026-11-10T08:00:00Z') }),
    entry({ id: 'r3', status: 'completed', duration: 30000, startTime: new Date('2026-11-10T07:00:00Z') }),
    entry({ id: 'r4', status: 'failed', duration: 40000, errorMessage: 'Timeout: element not found', startTime: new Date('2026-11-09T07:00:00Z') }),
    entry({ id: 'r5', status: 'running', duration: null, startTime: new Date('2026-11-10T11:59:00Z') }),
    // outside the 7-day window
    entry({ id: 'r6', status: 'failed', duration: 90000, startTime: new Date('2026-10-01T07:00:00Z') }),
  ];

  const records = [
    activity({ executionId: 'r1', activityName: 'Click Element', duration: 100 }),
    activity({ executionId: 'r2', activityName: 'Click Element', status: 'failed', duration: 5000, error: 'element not found' }),
    activity({ executionId: 'r2', activityName: 'Input Text', duration: 900 }),
    activity({ executionId: 'r4', activityName: 'Click Element', status: 'failed', duration: 6000, error: 'element not found (retry)' }),
    activity({ executionId: 'r3', activityName: 'Read Excel', duration: 9000 }),
    activity({ executionId: 'r6', activityName: 'Read Excel', duration: 9000 }),
  ];

  test('kpis: success rate, median, p95, failure count over the period', () => {
    const report = computeAnalytics(runs, records, { period: 7, now: NOW });
    expect(report.kpis.totalRuns).toBe(4); // running excluded, r6 outside window
    expect(report.kpis.failureCount).toBe(2);
    expect(report.kpis.successRate).toBeCloseTo(50);
    expect(report.kpis.medianDurationMs).toBe(25000);
    expect(report.kpis.p95DurationMs).toBe(40000);
  });

  test('trend is chronological and marks failures', () => {
    const report = computeAnalytics(runs, records, { period: 7, now: NOW });
    expect(report.trend.map((point) => point.durationMs)).toEqual([40000, 30000, 20000, 10000]);
    expect(report.trend.filter((point) => point.failed)).toHaveLength(2);
  });

  test('top failing activities carry counts and the last error', () => {
    const report = computeAnalytics(runs, records, { period: 7, now: NOW });
    expect(report.topFailing[0]).toEqual({
      activityName: 'Click Element',
      count: 2,
      lastError: 'element not found (retry)',
    });
  });

  test('top slow activities rank by median step duration', () => {
    const report = computeAnalytics(runs, records, { period: 7, now: NOW });
    expect(report.topSlow[0]).toEqual({ activityName: 'Read Excel', medianMs: 9000, runs: 1 });
    expect(report.topSlow[1].activityName).toBe('Click Element');
  });

  test('failure reasons group by message', () => {
    const report = computeAnalytics(runs, records, { period: 7, now: NOW });
    expect(report.failureReasons).toEqual([
      { reason: 'Timeout: element not found', count: 2 },
    ]);
  });

  test('period filter excludes old runs; all includes them', () => {
    const week = computeAnalytics(runs, records, { period: 7, now: NOW });
    expect(week.kpis.totalRuns).toBe(4);
    const all = computeAnalytics(runs, records, { period: 'all', now: NOW });
    expect(all.kpis.totalRuns).toBe(5);
    expect(all.kpis.failureCount).toBe(3);
  });

  test('process scope filters by diagram name', () => {
    const scoped = computeAnalytics(
      [...runs, entry({ id: 'r7', status: 'completed', duration: 5000, processName: 'Backup' })],
      [],
      { period: 'all', processName: 'Backup', now: NOW },
    );
    expect(scoped.kpis.totalRuns).toBe(1);
  });

  test('empty history yields zeroed kpis and empty tables', () => {
    const report = computeAnalytics([], [], { period: 7, now: NOW });
    expect(report.kpis).toEqual({
      totalRuns: 0,
      successRate: 0,
      medianDurationMs: null,
      p95DurationMs: null,
      failureCount: 0,
    });
    expect(report.trend).toEqual([]);
    expect(report.topFailing).toEqual([]);
  });
});

describe('analyticsToCsv', () => {
  test('serializes all sections with escaping', () => {
    const report = computeAnalytics(
      [
        entry({ id: 'r1', status: 'completed', duration: 10000 }),
        entry({ id: 'r2', status: 'failed', duration: 20000, errorMessage: 'Boom, "bad" input' }),
      ],
      [activity({ executionId: 'r2', activityName: 'Click Element', status: 'failed', duration: 5000, error: 'boom' })],
      { period: 'all', now: NOW },
    );
    const csv = analyticsToCsv(report);
    expect(csv).toContain('metric,value');
    expect(csv).toContain('total_runs,2');
    expect(csv).toContain('success_rate_pct,50.00');
    expect(csv).toContain('"Boom, ""bad"" input"');
    expect(csv).toContain('top_failing_activity,failures,last_error');
  });
});
