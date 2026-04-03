import React, { useRef, useEffect, useMemo } from 'react';
import {
  FiFilter,
  FiSearch,
  FiTrash2,
  FiDownload,
} from 'react-icons/fi';
import { useConsoleStore, type LogEntry } from '../../stores/consoleStore';
import type { LogLevel } from '../../types/events';

const LogLevelBadge: React.FC<{ level: LogLevel }> = ({ level }) => {
  const colors: Record<LogLevel, string> = {
    error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    debug: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    trace: 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-500',
  };

  return (
    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${colors[level]}`}>
      {level.toUpperCase()}
    </span>
  );
};

const LogLine: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const timeStr = entry.timestamp.toLocaleTimeString();

  return (
    <div className="log-entry flex items-start gap-2 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono text-sm">
      <span className="text-slate-400 text-xs flex-shrink-0">{timeStr}</span>
      <LogLevelBadge level={entry.level} />
      {entry.source && (
        <span className="text-slate-500 text-xs flex-shrink-0">[{entry.source}]</span>
      )}
      <span className="flex-1 break-all">{entry.message}</span>
    </div>
  );
};

const ConsoleOutput: React.FC = () => {
  const {
    logs,
    filter,
    searchQuery,
    autoScroll,
    clearLogs,
    toggleFilterLevel,
    setSearchQuery,
    setAutoScroll,
    getFilteredLogs,
    exportLogs,
  } = useConsoleStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const filteredLogs = useMemo(() => getFilteredLogs(), [getFilteredLogs]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [filteredLogs, autoScroll]);

  const handleExport = () => {
    const content = exportLogs();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rpaforge-console-${new Date().toISOString()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allLevels: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];

  return (
    <div className="h-full flex flex-col">
      <div className="console-header flex items-center gap-2 p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-1 flex-shrink-0">
          <FiFilter className="w-4 h-4 text-slate-400" />
          {allLevels.map((level) => (
            <button
              key={level}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                filter.includes(level)
                  ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
              onClick={() => toggleFilterLevel(level)}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search logs..."
            className="w-full pl-8 pr-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
              autoScroll ? 'text-indigo-500' : 'text-slate-400'
            }`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            <span className="text-xs">↓</span>
          </button>
          <button
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={handleExport}
            title="Export logs"
          >
            <FiDownload className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={clearLogs}
            title="Clear logs"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="console-output flex-1 overflow-y-auto bg-white dark:bg-slate-900">
        {filteredLogs.length === 0 ? (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
            {logs.length === 0 ? (
              <>
                No logs available
                <div className="text-xs mt-1">Run a process to see console output</div>
              </>
            ) : (
              'No logs match the current filter'
            )}
          </div>
        ) : (
          filteredLogs.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>

      <div className="console-footer flex items-center justify-between px-2 py-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <span>
          {filteredLogs.length} of {logs.length} entries
        </span>
        <span>Max: 10,000</span>
      </div>
    </div>
  );
};

export default ConsoleOutput;
