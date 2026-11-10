/**
 * Client-side execution analytics (issue #870).
 *
 * Pure aggregation over `executionHistoryStore` records — no backend, no new
 * IPC. The report is only as good as the local history retention (the store
 * prunes old entries), which the UI states next to the KPIs.
 */

import type {
  ActivityExecutionRecord,
  ExecutionHistoryEntry,
} from '../stores/executionHistoryStore';

export type AnalyticsPeriod = 7 | 30 | 'all';

export interface AnalyticsOptions {
  period: AnalyticsPeriod;
  /** Filter by process name; undefined = all diagrams. */
  processName?: string;
  /** Reference clock (defaults to now) — injectable for tests. */
  now?: Date;
}

export interface AnalyticsKpis {
  totalRuns: number;
  successRate: number;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  failureCount: number;
}

export interface TrendPoint {
  startedAt: Date;
  durationMs: number | null;
  failed: boolean;
}

export interface ActivityFailure {
  activityName: string;
  count: number;
  lastError: string;
}

export interface ActivitySlowness {
  activityName: string;
  medianMs: number;
  runs: number;
}

export interface FailureReason {
  reason: string;
  count: number;
}

export interface AnalyticsReport {
  kpis: AnalyticsKpis;
  trend: TrendPoint[];
  topFailing: ActivityFailure[];
  topSlow: ActivitySlowness[];
  failureReasons: FailureReason[];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** 95th percentile by the nearest-rank method (ceil(0.95 * n) - 1). */
export function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
  return sorted[index];
}

function withinPeriod(entry: ExecutionHistoryEntry, options: AnalyticsOptions): boolean {
  if (options.period === 'all') return true;
  const now = options.now ?? new Date();
  const cutoff = now.getTime() - options.period * 24 * 60 * 60 * 1000;
  return entry.startTime.getTime() >= cutoff;
}

/** Aggregate finished runs into the analytics report. */
export function computeAnalytics(
  entries: ExecutionHistoryEntry[],
  activityRecords: ActivityExecutionRecord[],
  options: AnalyticsOptions,
): AnalyticsReport {
  const filtered = entries.filter(
    (entry) =>
      entry.status !== 'running' &&
      withinPeriod(entry, options) &&
      (options.processName === undefined || entry.processName === options.processName),
  );
  const filteredIds = new Set(filtered.map((entry) => entry.id));

  const durations = filtered
    .map((entry) => entry.duration)
    .filter((duration): duration is number => typeof duration === 'number');
  const failures = filtered.filter((entry) => entry.status === 'failed');

  const trend: TrendPoint[] = [...filtered]
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .map((entry) => ({
      startedAt: entry.startTime,
      durationMs: entry.duration,
      failed: entry.status === 'failed',
    }));

  const activityByExecution = new Map<string, ActivityExecutionRecord[]>();
  for (const record of activityRecords) {
    if (!filteredIds.has(record.executionId)) continue;
    const list = activityByExecution.get(record.executionId) ?? [];
    list.push(record);
    activityByExecution.set(record.executionId, list);
  }

  const failureByName = new Map<string, ActivityFailure>();
  const durationsByName = new Map<string, number[]>();
  for (const records of activityByExecution.values()) {
    for (const record of records) {
      if (record.status === 'failed') {
        const current = failureByName.get(record.activityName) ?? {
          activityName: record.activityName,
          count: 0,
          lastError: '',
        };
        current.count += 1;
        if (record.error) current.lastError = record.error;
        failureByName.set(record.activityName, current);
      }
      if (typeof record.duration === 'number' && record.status !== 'skipped') {
        const durations_ = durationsByName.get(record.activityName) ?? [];
        durations_.push(record.duration);
        durationsByName.set(record.activityName, durations_);
      }
    }
  }

  const topFailing = [...failureByName.values()]
    .sort((a, b) => b.count - a.count || a.activityName.localeCompare(b.activityName))
    .slice(0, 5);
  const topSlow = [...durationsByName.entries()]
    .map(([activityName, values]) => ({
      activityName,
      medianMs: median(values) ?? 0,
      runs: values.length,
    }))
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, 5);

  const reasonCounts = new Map<string, number>();
  for (const entry of failures) {
    const reason = entry.errorMessage?.split('\n')[0]?.slice(0, 120) || 'unknown';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const failureReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    kpis: {
      totalRuns: filtered.length,
      successRate:
        filtered.length === 0
          ? 0
          : ((filtered.length - failures.length) / filtered.length) * 100,
      medianDurationMs: median(durations),
      p95DurationMs: percentile95(durations),
      failureCount: failures.length,
    },
    trend,
    topFailing,
    topSlow,
    failureReasons,
  };
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRows(header: string[], rows: Array<Array<string | number>>): string {
  return [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(',')).join('\n');
}

/** CSV export for the aggregated tables (issue #870). */
export function analyticsToCsv(report: AnalyticsReport): string {
  const sections: string[] = [];

  sections.push(
    toCsvRows(['metric', 'value'], [
      ['total_runs', report.kpis.totalRuns],
      ['success_rate_pct', report.kpis.successRate.toFixed(2)],
      ['median_duration_ms', report.kpis.medianDurationMs ?? ''],
      ['p95_duration_ms', report.kpis.p95DurationMs ?? ''],
      ['failures', report.kpis.failureCount],
    ]),
  );

  sections.push(
    toCsvRows(
      ['top_failing_activity', 'failures', 'last_error'],
      report.topFailing.map((f) => [f.activityName, f.count, f.lastError]),
    ),
  );

  sections.push(
    toCsvRows(
      ['top_slow_activity', 'median_ms', 'runs'],
      report.topSlow.map((s) => [s.activityName, s.medianMs, s.runs]),
    ),
  );

  sections.push(
    toCsvRows(
      ['failure_reason', 'count'],
      report.failureReasons.map((r) => [r.reason, r.count]),
    ),
  );

  return sections.join('\n\n');
}

/** Build and download the CSV report (client-side, no backend). */
export function downloadAnalyticsCsv(report: AnalyticsReport): void {
  const blob = new Blob([analyticsToCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `rpaforge-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
