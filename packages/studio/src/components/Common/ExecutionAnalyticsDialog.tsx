import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiTrendingUp, FiX } from 'react-icons/fi';
import { useExecutionHistoryStore } from '../../stores/executionHistoryStore';
import {
  computeAnalytics,
  downloadAnalyticsCsv,
  type AnalyticsPeriod,
} from '../../utils/executionAnalytics';

type PeriodLabel = '7' | '30' | 'all';

const PERIODS: PeriodLabel[] = ['7', '30', 'all'];

function Sparkline({
  values,
  failedFlags,
}: {
  values: Array<number | null>;
  failedFlags: boolean[];
}) {
  const { t } = useTranslation('common');
  const width = 260;
  const height = 48;
  const numeric = values.filter((value): value is number => typeof value === 'number');
  if (numeric.length === 0) return null;
  const max = Math.max(...numeric);
  const min = Math.min(...numeric);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => {
    if (typeof value !== 'number') return null;
    const x = index * step;
    const y = height - 4 - ((value - min) / span) * (height - 8);
    return { x, y, failed: failedFlags[index] };
  });
  const path = points
    .filter((point): point is { x: number; y: number; failed: boolean } => point !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');

  return (
    <svg
      data-testid="analytics-sparkline"
      width={width}
      height={height}
      role="img"
      aria-label={t(`analytics.durationTrend`)}
      className="text-indigo-500"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      {points.map(
        (point, index) =>
          point !== null &&
          point.failed && (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="2.5"
              className="fill-red-500"
              aria-hidden="true"
            />
          ),
      )}
    </svg>
  );
}

interface ExecutionAnalyticsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ExecutionAnalyticsDialog({ open, onClose }: ExecutionAnalyticsDialogProps) {
  const { t } = useTranslation('common');
  const history = useExecutionHistoryStore((s) => s.history);
  const activityRecordMap = useExecutionHistoryStore((s) => s.activityRecords);

  const activityRecords = useMemo(
    () => Array.from(activityRecordMap.values()).flat(),
    [activityRecordMap],
  );
  const [period, setPeriod] = useState<AnalyticsPeriod>(7);
  const [processName, setProcessName] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const report = useMemo(
    () =>
      computeAnalytics(history, activityRecords, {
        period,
        processName: processName || undefined,
      }),
    [history, activityRecords, period, processName],
  );

  const processNames = useMemo(
    () => Array.from(new Set(history.map((entry) => entry.processName))).sort(),
    [history],
  );

  if (!open) return null;

  const kpi = report.kpis;
  const hasData = kpi.totalRuns > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('analytics.title')}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-ui-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-ui-text">
            <FiTrendingUp className="h-5 w-5" />
            {t('analytics.title')}
          </h2>
          <button
            className="rounded p-1 hover:bg-ui-surface-hover"
            onClick={onClose}
            aria-label={t('actions.close')}
          >
            <FiX className="h-5 w-5 text-ui-text-muted" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label={t('analytics.period')}
            value={String(period)}
            onChange={(event) =>
              setPeriod(
                event.target.value === 'all'
                  ? 'all'
                  : (Number(event.target.value) as AnalyticsPeriod),
              )
            }
            className="rounded border border-ui-border bg-ui-surface px-2 py-1 text-ui-text"
          >
            {PERIODS.map((option) => (
              <option key={option} value={option}>
                {t(`analytics.period.${option}`)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('analytics.scope')}
            value={processName}
            onChange={(event) => setProcessName(event.target.value)}
            className="rounded border border-ui-border bg-ui-surface px-2 py-1 text-ui-text"
          >
            <option value="">{t('analytics.scopeAll')}</option>
            {processNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => downloadAnalyticsCsv(report)}
            disabled={!hasData}
            className="ml-auto flex items-center gap-1 rounded border border-ui-border px-2 py-1 text-ui-text-muted hover:bg-ui-surface-hover disabled:opacity-40"
          >
            <FiDownload className="h-3 w-3" />
            {t('analytics.exportCsv')}
          </button>
        </div>

        {!hasData ? (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded bg-ui-surface-muted p-8 text-center"
            data-testid="analytics-empty"
          >
            <p className="text-sm font-medium text-ui-text">{t('analytics.emptyTitle')}</p>
            <p className="max-w-sm text-xs text-ui-text-muted">{t('analytics.emptyHint')}</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-3 text-xs text-ui-text-muted" role="note">
              {t('analytics.retentionNote')}
            </p>

            <div
              className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
              aria-live="polite"
              data-testid="analytics-kpis"
            >
              {[
                { label: t('analytics.kpi.totalRuns'), value: String(kpi.totalRuns) },
                {
                  label: t('analytics.kpi.successRate'),
                  value: `${kpi.successRate.toFixed(1)}%`,
                },
                {
                  label: t('analytics.kpi.medianDuration'),
                  value: kpi.medianDurationMs !== null ? `${Math.round(kpi.medianDurationMs)} ms` : '—',
                },
                {
                  label: t('analytics.kpi.p95Duration'),
                  value: kpi.p95DurationMs !== null ? `${Math.round(kpi.p95DurationMs)} ms` : '—',
                },
              ].map((card) => (
                <div key={card.label} className="rounded bg-ui-surface-muted p-3">
                  <div className="text-xs text-ui-text-muted">{card.label}</div>
                  <div className="mt-1 text-lg font-semibold text-ui-text">{card.value}</div>
                </div>
              ))}
            </div>

            <div className="mb-4 rounded bg-ui-surface-muted p-3">
              <div className="mb-1 text-xs font-medium text-ui-text">
                {t('analytics.durationTrend')}
              </div>
              <Sparkline
                values={report.trend.map((point) => point.durationMs)}
                failedFlags={report.trend.map((point) => point.failed)}
              />
              <div className="mt-1 text-[11px] text-ui-text-muted">
                {t('analytics.trendLegend')}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 text-xs font-semibold text-ui-text">
                  {t('analytics.topFailing')}
                </h3>
                {report.topFailing.length === 0 ? (
                  <p className="text-xs text-ui-text-muted">{t('analytics.tableEmpty')}</p>
                ) : (
                  <table className="w-full text-xs" data-testid="analytics-top-failing">
                    <thead>
                      <tr className="text-left text-ui-text-muted">
                        <th className="pr-2">{t('analytics.col.activity')}</th>
                        <th className="pr-2">{t('analytics.col.failures')}</th>
                        <th>{t('analytics.col.lastError')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topFailing.map((failure) => (
                        <tr key={failure.activityName} className="border-t border-ui-border">
                          <td className="pr-2 py-1 font-mono">{failure.activityName}</td>
                          <td className="pr-2 py-1">{failure.count}</td>
                          <td className="py-1 max-w-40 truncate" title={failure.lastError}>
                            {failure.lastError || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div>
                <h3 className="mb-1 text-xs font-semibold text-ui-text">
                  {t('analytics.topSlow')}
                </h3>
                {report.topSlow.length === 0 ? (
                  <p className="text-xs text-ui-text-muted">{t('analytics.tableEmpty')}</p>
                ) : (
                  <table className="w-full text-xs" data-testid="analytics-top-slow">
                    <thead>
                      <tr className="text-left text-ui-text-muted">
                        <th className="pr-2">{t('analytics.col.activity')}</th>
                        <th className="pr-2">{t('analytics.col.median')}</th>
                        <th>{t('analytics.col.runs')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topSlow.map((slow) => (
                        <tr key={slow.activityName} className="border-t border-ui-border">
                          <td className="pr-2 py-1 font-mono">{slow.activityName}</td>
                          <td className="pr-2 py-1">{Math.round(slow.medianMs)} ms</td>
                          <td className="py-1">{slow.runs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {report.failureReasons.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-1 text-xs font-semibold text-ui-text">
                  {t('analytics.failureReasons')}
                </h3>
                <ul className="space-y-1 text-xs" data-testid="analytics-failure-reasons">
                  {report.failureReasons.map((reason) => (
                    <li key={reason.reason} className="flex items-center gap-2">
                      <span className="rounded bg-red-600/20 px-1.5 py-0.5 text-red-500">
                        {reason.count}
                      </span>
                      <span className="max-w-md truncate font-mono text-ui-text-muted" title={reason.reason}>
                        {reason.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
