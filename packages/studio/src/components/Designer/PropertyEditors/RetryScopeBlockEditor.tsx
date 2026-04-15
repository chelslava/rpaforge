import React from 'react';
import { FiRepeat } from 'react-icons/fi';

interface RetryScopeBlockEditorProps {
  blockData: {
    retryCount?: number;
    retryInterval?: string;
    condition?: string;
  };
  onUpdateBlockData: (updates: Partial<{
    retryCount: number;
    retryInterval: string;
    condition: string;
  }>) => void;
}

const INTERVAL_OPTIONS = [
  { value: '1s', label: '1 second' },
  { value: '2s', label: '2 seconds' },
  { value: '5s', label: '5 seconds' },
  { value: '10s', label: '10 seconds' },
  { value: '30s', label: '30 seconds' },
  { value: '1m', label: '1 minute' },
];

const RetryScopeBlockEditor: React.FC<RetryScopeBlockEditorProps> = ({
  blockData,
  onUpdateBlockData,
}) => {
  const retryCount = blockData.retryCount ?? 3;
  const retryInterval = blockData.retryInterval ?? '5s';
  const condition = blockData.condition ?? '';

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <FiRepeat className="h-4 w-4" />
          <span className="text-sm font-medium">Retry Scope</span>
        </div>
        <p className="mt-1 text-xs text-amber-500 dark:text-amber-300">
          Activities inside this block will be retried if they fail.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Number of Retries
        </label>
        <input
          type="number"
          min={0}
          max={100}
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={retryCount}
          onChange={(e) => onUpdateBlockData({ retryCount: parseInt(e.target.value, 10) || 0 })}
        />
        <p className="mt-1 text-xs text-slate-500">
          How many times to retry after initial failure (0 = no retries)
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Retry Interval
        </label>
        <select
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={retryInterval}
          onChange={(e) => onUpdateBlockData({ retryInterval: e.target.value })}
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Time to wait between retry attempts
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Stop Condition (Optional)
        </label>
        <input
          type="text"
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
          value={condition}
          onChange={(e) => onUpdateBlockData({ condition: e.target.value })}
          placeholder="e.g., ${result} == 'success'"
        />
        <p className="mt-1 text-xs text-slate-500">
          Python expression - if true, stops retrying early
        </p>
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Retry Summary
        </div>
        <div className="mt-2 space-y-1 text-xs text-slate-700 dark:text-slate-300">
          <div>Attempts: {retryCount + 1} (1 initial + {retryCount} retries)</div>
          <div>Interval: {INTERVAL_OPTIONS.find(o => o.value === retryInterval)?.label}</div>
          {condition && <div>Stop condition: {condition}</div>}
        </div>
      </div>
    </div>
  );
};

export default RetryScopeBlockEditor;
