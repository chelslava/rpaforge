import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiClock, FiPlay, FiXCircle } from 'react-icons/fi';
import {
  useExecutionHistoryStore,
  type ActivityExecutionRecord,
  type ExecutionStatus,
} from '../../stores/executionHistoryStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useSelectionStore } from '../../stores/selectionStore';
import type { Variable } from '../../types/engine';

const statusStyles = {
  running: { bar: 'bg-blue-500', icon: FiPlay, text: 'text-blue-500' },
  success: { bar: 'bg-green-500', icon: FiCheckCircle, text: 'text-green-500' },
  failed: { bar: 'bg-red-500', icon: FiXCircle, text: 'text-red-500' },
  skipped: { bar: 'bg-slate-400', icon: FiClock, text: 'text-slate-400' },
} as const;

const executionStatusLabel: Record<ExecutionStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  stopped: 'Stopped',
};

const formatDuration = (duration: number | null): string => {
  if (duration === null) return '—';
  return duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`;
};

function outputToVariables(output: unknown, activityName: string): Variable[] {
  if (output === null || output === undefined) return [];
  if (typeof output === 'object' && !Array.isArray(output)) {
    return Object.entries(output as Record<string, unknown>).map(([name, value]) => ({
      name,
      value,
      type: Array.isArray(value) ? 'array' : typeof value,
    }));
  }
  return [{ name: `${activityName} output`, value: output, type: typeof output }];
}

const TimelineRecord: React.FC<{
  record: ActivityExecutionRecord;
  origin: number;
  span: number;
  onSelect: (record: ActivityExecutionRecord) => void;
}> = ({ record, origin, span, onSelect }) => {
  const style = statusStyles[record.status];
  const Icon = style.icon;
  const start = record.startTime.getTime();
  const end = record.endTime?.getTime() ?? start + 1;
  const left = Math.max(0, ((start - origin) / span) * 100);
  const width = Math.max(2, ((Math.max(end, start + 1) - start) / span) * 100);

  return (
    <button
      type="button"
      className="w-full grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-2 px-3 py-2 text-left hover:bg-ui-surface-hover border-b border-ui-border"
      onClick={() => onSelect(record)}
      title={`${record.activityName} · ${formatDuration(record.duration)}`}
    >
      <span className="flex items-center gap-1.5 min-w-0 text-xs text-ui-text">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${style.text}`} />
        <span className="truncate">{record.activityName}</span>
      </span>
      <span className="relative h-5 rounded bg-ui-surface-inset overflow-hidden" aria-hidden="true">
        <span
          className={`absolute top-1 h-3 rounded ${style.bar}`}
          style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
        />
      </span>
      <span className="text-[11px] text-ui-text-muted tabular-nums">{formatDuration(record.duration)}</span>
    </button>
  );
};

const ExecutionTimeline: React.FC = () => {
  const { t } = useTranslation('common');
  const history = useExecutionHistoryStore((state) => state.history);
  const activityRecords = useExecutionHistoryStore((state) => state.activityRecords);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const setSelectedNode = useSelectionStore((state) => state.setSelectedNode);
  const setVariables = useDebuggerStore((state) => state.setVariables);

  const activeExecutionId = selectedExecutionId && history.some((entry) => entry.id === selectedExecutionId)
    ? selectedExecutionId
    : history[0]?.id ?? null;
  const selectedExecution = history.find((entry) => entry.id === activeExecutionId);
  const records = useMemo(
    () => (activeExecutionId ? activityRecords.get(activeExecutionId) ?? [] : []),
    [activeExecutionId, activityRecords]
  );

  const { origin, span } = useMemo(() => {
    if (records.length === 0) return { origin: 0, span: 1 };
    const origin = Math.min(...records.map((record) => record.startTime.getTime()));
    const end = Math.max(...records.map((record) => record.endTime?.getTime() ?? record.startTime.getTime() + 1));
    return { origin, span: Math.max(1, end - origin) };
  }, [records]);

  const handleSelect = (record: ActivityExecutionRecord) => {
    setSelectedNode(record.nodeId);
    setVariables(outputToVariables(record.output, record.activityName));
  };

  if (!selectedExecution || records.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-center text-ui-text-muted">
        <FiClock className="w-8 h-8 opacity-50" />
        <span className="text-sm">{t('executionTimeline.empty', 'Run the process to see its execution timeline')}</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-ui-border">
        <label htmlFor="execution-timeline-run" className="sr-only">
          {t('executionTimeline.selectRun', 'Select execution')}
        </label>
        <select
          id="execution-timeline-run"
          value={activeExecutionId ?? ''}
          onChange={(event) => setSelectedExecutionId(event.target.value)}
          className="min-w-0 flex-1 px-2 py-1 text-xs rounded border border-ui-border bg-ui-surface text-ui-text"
        >
          {history.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.processName} · {entry.startTime.toLocaleTimeString()} · {executionStatusLabel[entry.status]}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-ui-text-muted tabular-nums">{records.length} steps</span>
      </div>
      <div className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] gap-2 px-3 py-1 text-[10px] uppercase tracking-wide text-ui-text-muted border-b border-ui-border">
        <span>{t('executionTimeline.activity', 'Activity')}</span>
        <span>{t('executionTimeline.timeline', 'Timeline')}</span>
        <span>{t('executionTimeline.duration', 'Duration')}</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {records.map((record) => (
          <TimelineRecord key={record.id} record={record} origin={origin} span={span} onSelect={handleSelect} />
        ))}
      </div>
    </div>
  );
};

export default ExecutionTimeline;
