import React, { useState, useMemo } from 'react';
import {
  FiPlay,
  FiCheckCircle,
  FiXCircle,
  FiSquare,
  FiClock,
  FiChevronRight,
  FiChevronDown,
  FiTrash2,
  FiActivity,
} from 'react-icons/fi';
import {
  useExecutionHistoryStore,
  type ExecutionHistoryEntry,
  type ActivityExecutionRecord,
  type ExecutionStatus,
} from '../../stores/executionHistoryStore';

const StatusIcon: React.FC<{ status: ExecutionStatus }> = ({ status }) => {
  const config = {
    running: { icon: FiPlay, color: 'text-blue-500 animate-pulse' },
    completed: { icon: FiCheckCircle, color: 'text-green-500' },
    failed: { icon: FiXCircle, color: 'text-red-500' },
    stopped: { icon: FiSquare, color: 'text-yellow-500' },
  };

  const { icon: Icon, color } = config[status];
  return <Icon className={`w-4 h-4 ${color}`} />;
};

const formatDuration = (ms: number | null): string => {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

const ActivityRecord: React.FC<{ record: ActivityExecutionRecord }> = ({ record }) => {
  const statusColors = {
    running: 'bg-blue-50 dark:bg-blue-900/20',
    success: 'bg-green-50 dark:bg-green-900/20',
    failed: 'bg-red-50 dark:bg-red-900/20',
    skipped: 'bg-slate-50 dark:bg-slate-800',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 text-xs ${statusColors[record.status]}`}>
      <FiActivity className="w-3 h-3 text-slate-400 flex-shrink-0" />
      <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-300">
        {record.activityName}
      </span>
      <span className="text-slate-400">{formatDuration(record.duration)}</span>
    </div>
  );
};

const ExecutionEntry: React.FC<{
  entry: ExecutionHistoryEntry;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ entry, isExpanded, onToggle }) => {
  const activities = useExecutionHistoryStore((state) => state.getExecutionActivities(entry.id));
  const records = activities;

  return (
    <div className="border-b border-slate-200 dark:border-slate-700 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
      >
        {isExpanded ? (
          <FiChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <FiChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <StatusIcon status={entry.status} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate text-slate-900 dark:text-slate-100">
            {entry.processName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span>{entry.startTime.toLocaleTimeString()}</span>
            <span>•</span>
            <span>{entry.activitiesExecuted} activities</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FiClock className="w-3 h-3" />
              {formatDuration(entry.duration)}
            </span>
          </div>
        </div>
      </button>

      {isExpanded && records.length > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          {records.map((record) => (
            <ActivityRecord key={record.id} record={record} />
          ))}
        </div>
      )}

      {isExpanded && entry.errorMessage && (
        <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-t border-slate-100 dark:border-slate-800">
          {entry.errorMessage}
        </div>
      )}
    </div>
  );
};

const ExecutionHistoryPanel: React.FC = () => {
  const history = useExecutionHistoryStore((state) => state.history);
  const clearHistory = useExecutionHistoryStore((state) => state.clearHistory);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExecutionStatus | 'all'>('all');

  const filteredHistory = useMemo(() => {
    if (filter === 'all') return history;
    return history.filter((entry) => entry.status === filter);
  }, [history, filter]);

  const handleToggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">
          Execution History
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ExecutionStatus | 'all')}
            className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="stopped">Stopped</option>
          </select>
          <button
            onClick={clearHistory}
            className="p-1 text-slate-400 hover:text-red-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Clear history"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <FiClock className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
            <div className="text-sm text-slate-500 dark:text-slate-400">
              No execution history
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Run a process to see history
            </div>
          </div>
        ) : (
          filteredHistory.map((entry) => (
            <ExecutionEntry
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggle={() => handleToggle(entry.id)}
            />
          ))
        )}
      </div>

      {history.length > 0 && (
        <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          {history.length} execution{history.length !== 1 ? 's' : ''} in history
        </div>
      )}
    </div>
  );
};

export default ExecutionHistoryPanel;
