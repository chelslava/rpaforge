import React, { useRef, useEffect, useMemo, useState } from 'react';
import {
  FiFilter,
  FiSearch,
  FiTrash2,
  FiDownload,
  FiChevronDown,
  FiChevronRight,
  FiAlertCircle,
  FiFile,
  FiExternalLink,
  FiMessageSquare,
} from 'react-icons/fi';
import { useConsoleStore, type LogEntry } from '../../stores/consoleStore';
import type { LogLevel } from '../../types/events';
import { config } from '../../config/app.config';

const LOG_FILE_PATH = config.logging?.file || '~/.rpaforge/logs/app.log';

interface ErrorSuggestion {
  causes: string[];
  fix: string;
  docsUrl?: string;
}

const errorSuggestions: Record<string, ErrorSuggestion> = {
  'Element not found': {
    causes: [
      'Element not loaded yet (add Wait before)',
      'Wrong selector (check element ID)',
      'Element in different frame/tab',
    ],
    fix: 'Add "Wait For Element" before this activity to ensure page is loaded.',
    docsUrl: 'https://docs.rpaforge.dev/webui/waiting',
  },
  'Timeout': {
    causes: [
      'Page load too slow',
      'Network latency',
      'Element never appeared',
    ],
    fix: 'Increase timeout value or add explicit wait conditions.',
    docsUrl: 'https://docs.rpaforge.dev/best-practices/timeouts',
  },
  'Connection refused': {
    causes: [
      'Application not running',
      'Wrong port or address',
    ],
    fix: 'Check that the target application is running and accessible.',
    docsUrl: 'https://docs.rpaforge.dev/troubleshooting/connection',
  },
  'Permission denied': {
    causes: [
      'Insufficient privileges',
      'File locked by another process',
    ],
    fix: 'Run the process with appropriate permissions or close conflicting applications.',
    docsUrl: 'https://docs.rpaforge.dev/troubleshooting/permissions',
  },
  'File not found': {
    causes: [
      'Path does not exist',
      'Relative path resolved incorrectly',
    ],
    fix: 'Use absolute paths and verify the file exists before running.',
    docsUrl: 'https://docs.rpaforge.dev/file/paths',
  },
  'No such file': {
    causes: [
      'File was deleted',
      'Incorrect path case (Linux/macOS)',
      'Network drive disconnected',
    ],
    fix: 'Verify the file path is correct and the file exists.',
    docsUrl: 'https://docs.rpaforge.dev/file/paths',
  },
  'TypeError': {
    causes: [
      'Variable has unexpected type',
      'Calling method on null/undefined',
    ],
    fix: 'Check the variable type with Log activity and add null checks.',
    docsUrl: 'https://docs.rpaforge.dev/variables/types',
  },
  'AttributeError': {
    causes: [
      'Object has no such attribute',
      'Wrong object type',
    ],
    fix: 'Verify the object structure and use correct attribute names.',
    docsUrl: 'https://docs.rpaforge.dev/variables/types',
  },
  'ValueError': {
    causes: [
      'Invalid argument value',
      'Wrong data format',
    ],
    fix: 'Check the expected value format in activity documentation.',
    docsUrl: 'https://docs.rpaforge.dev/activities/parameters',
  },
  'KeyError': {
    causes: [
      'Dictionary key does not exist',
      'Typo in key name',
    ],
    fix: 'Verify the dictionary contains the key before accessing.',
    docsUrl: 'https://docs.rpaforge.dev/variables/dictionaries',
  },
  'IndexError': {
    causes: [
      'List index out of range',
      'Empty list',
    ],
    fix: 'Check list length before accessing elements.',
    docsUrl: 'https://docs.rpaforge.dev/variables/lists',
  },
  'Invalid selector': {
    causes: [
      'XPath/CSS syntax error',
      'Element removed from DOM',
    ],
    fix: 'Test the selector in browser developer tools before use.',
    docsUrl: 'https://docs.rpaforge.dev/webui/selectors',
  },
  'WebDriverException': {
    causes: [
      'Browser closed unexpectedly',
      'Browser driver mismatch',
    ],
    fix: 'Restart the browser and ensure WebUI activities run in sequence.',
    docsUrl: 'https://docs.rpaforge.dev/webui/troubleshooting',
  },
  'SQL': {
    causes: [
      'Syntax error in query',
      'Table/column does not exist',
      'Database connection lost',
    ],
    fix: 'Check SQL syntax and verify database is accessible.',
    docsUrl: 'https://docs.rpaforge.dev/database/errors',
  },
  'Database': {
    causes: [
      'Connection string incorrect',
      'Database server not running',
      'Authentication failed',
    ],
    fix: 'Verify connection string and database credentials.',
    docsUrl: 'https://docs.rpaforge.dev/database/connection',
  },
};

interface ErrorSuggestion {
  causes: string[];
  fix: string;
}

const errorSuggestions: Record<string, ErrorSuggestion> = {
  'Element not found': {
    causes: [
      'Element not loaded yet (add Wait before)',
      'Wrong selector (check element ID)',
      'Element in different frame/tab',
    ],
    fix: 'Add "Wait For Element" before this activity to ensure page is loaded.',
  },
  'Timeout': {
    causes: [
      'Page load too slow',
      'Network latency',
      'Element never appeared',
    ],
    fix: 'Increase timeout value or add explicit wait conditions.',
  },
  'Connection refused': {
    causes: [
      'Application not running',
      'Wrong port or address',
    ],
    fix: 'Check that the target application is running and accessible.',
  },
  'Permission denied': {
    causes: [
      'Insufficient privileges',
      'File locked by another process',
    ],
    fix: 'Run the process with appropriate permissions or close conflicting applications.',
  },
  'File not found': {
    causes: [
      'Path does not exist',
      'Relative path resolved incorrectly',
    ],
    fix: 'Use absolute paths and verify the file exists before running.',
  },
};

function matchSuggestion(message: string): ErrorSuggestion | null {
  for (const [key, suggestion] of Object.entries(errorSuggestions)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return suggestion;
    }
  }
  return null;
}

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

const ErrorCard: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const [expanded, setExpanded] = useState(false);
  const suggestion = matchSuggestion(entry.message);
  const details = entry.details as Record<string, string> | undefined;

  const handleReportIssue = () => {
    const issueTitle = encodeURIComponent(`Error: ${entry.message.slice(0, 50)}`);
    const issueBody = encodeURIComponent(
      `## Error Details\n\`\`\`\n${entry.message}\n\`\`\`\n\n## Context\n- Activity: ${details?.activityName || 'N/A'}\n- Library: ${details?.library || 'N/A'}\n- Time: ${entry.timestamp.toISOString()}\n\n## Steps to Reproduce\n1. \n2. \n3. \n\n## Expected Behavior\n\n## Actual Behavior`
    );
    window.open(`https://github.com/chelslava/rpaforge/issues/new?title=${issueTitle}&body=${issueBody}`, '_blank');
  };

  return (
    <div className="mx-2 my-1 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-sm">
      <button
        className="w-full flex items-start gap-2 px-2 py-1.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <FiAlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <span className="flex-1 break-all text-red-700 dark:text-red-300 font-mono">{entry.message}</span>
        {suggestion && (
          expanded ? <FiChevronDown className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" /> : <FiChevronRight className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        )}
      </button>
      {details?.activityName && (
        <div className="px-8 pb-1 text-xs text-red-600 dark:text-red-400">
          Activity: {details.activityName}
          {details.library && <span className="ml-2">Library: {details.library}</span>}
        </div>
      )}
      {expanded && suggestion && (
        <div className="px-8 pb-2 space-y-2">
          <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Possible causes:</div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc list-inside space-y-0.5">
            {suggestion.causes.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>
          <div className="text-xs text-indigo-600 dark:text-indigo-400">
            Suggested fix: {suggestion.fix}
          </div>
          {suggestion.docsUrl && (
            <a
              href={suggestion.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <FiExternalLink className="w-3 h-3" />
              View documentation
            </a>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-red-200 dark:border-red-800">
            <button
              onClick={handleReportIssue}
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <FiMessageSquare className="w-3 h-3" />
              Report Issue
            </button>
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <FiFile className="w-3 h-3" />
              {LOG_FILE_PATH}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const LogLine: React.FC<{ entry: LogEntry; index: number }> = ({ entry, index }) => {
  const timeStr = entry.timestamp.toLocaleTimeString();

  if (entry.level === 'error') {
    return <ErrorCard entry={entry} />;
  }

  return (
    <div className="log-entry flex items-start gap-2 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono text-sm">
      <span className="text-slate-400 text-xs w-10 text-right flex-shrink-0 select-none">
        {String(index + 1).padStart(3, ' ')}
      </span>
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
  const logs = useConsoleStore((state) => state.logs);
  const filter = useConsoleStore((state) => state.filter);
  const searchQuery = useConsoleStore((state) => state.searchQuery);
  const autoScroll = useConsoleStore((state) => state.autoScroll);
  const clearLogs = useConsoleStore((state) => state.clearLogs);
  const toggleFilterLevel = useConsoleStore((state) => state.toggleFilterLevel);
  const setSearchQuery = useConsoleStore((state) => state.setSearchQuery);
  const setAutoScroll = useConsoleStore((state) => state.setAutoScroll);
  const exportLogs = useConsoleStore((state) => state.exportLogs);

  const containerRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    let filtered = logs.filter((log) => filter.includes(log.level));

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.source?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [logs, filter, searchQuery]);

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
          filteredLogs.map((entry, index) => <LogLine key={entry.id} entry={entry} index={index} />)
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
