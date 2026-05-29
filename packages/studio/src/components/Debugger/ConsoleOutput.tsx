import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
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
  FiLayers,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useConsoleStore, type LogEntry } from '../../stores/consoleStore';
import type { LogLevel } from '../../types/events';
import { buildIssueReportUrl } from '../../utils/issueReportUrl';
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const LOG_FILE_PATH = navigator.platform.startsWith('Win')
  ? String.raw`%USERPROFILE%\.rpaforge\logs\app.log`
  : '~/.rpaforge/logs/app.log';

interface ErrorSuggestion {
  causes: string[];
  fix: string;
  docsUrl?: string;
}

function useErrorSuggestions(): Record<string, ErrorSuggestion> {
  const { t } = useTranslation('common');
  return {
    'Element not found': {
      causes: [
        t('console.errorCauses.elementNotLoaded'),
        t('console.errorCauses.wrongSelector'),
        t('console.errorCauses.elementInDifferentFrame'),
      ],
      fix: t('console.errorFix.elementNotFound'),
      docsUrl: 'https://docs.rpaforge.dev/webui/waiting',
    },
    'Timeout': {
      causes: [
        t('console.errorCauses.pageLoadSlow'),
        t('console.errorCauses.networkLatency'),
        t('console.errorCauses.elementNeverAppeared'),
      ],
      fix: t('console.errorFix.increaseTimeout'),
      docsUrl: 'https://docs.rpaforge.dev/best-practices/timeouts',
    },
    'Connection refused': {
      causes: [
        t('console.errorCauses.applicationNotRunning'),
        t('console.errorCauses.wrongPortAddress'),
      ],
      fix: t('console.errorFix.checkApplicationRunning'),
      docsUrl: 'https://docs.rpaforge.dev/troubleshooting/connection',
    },
    'Permission denied': {
      causes: [
        t('console.errorCauses.insufficientPrivileges'),
        t('console.errorCauses.fileLocked'),
      ],
      fix: t('console.errorFix.checkPermissions'),
      docsUrl: 'https://docs.rpaforge.dev/troubleshooting/permissions',
    },
    'File not found': {
      causes: [
        t('console.errorCauses.pathDoesNotExist'),
        t('console.errorCauses.relativePathResolved'),
      ],
      fix: t('console.errorFix.useAbsolutePaths'),
      docsUrl: 'https://docs.rpaforge.dev/file/paths',
    },
    'No such file': {
      causes: [
        t('console.errorCauses.fileWasDeleted'),
        t('console.errorCauses.incorrectPathCase'),
        t('console.errorCauses.networkDriveDisconnected'),
      ],
      fix: t('console.errorFix.verifyFilePath'),
      docsUrl: 'https://docs.rpaforge.dev/file/paths',
    },
    'TypeError': {
      causes: [
        t('console.errorCauses.variableUnexpectedType'),
        t('console.errorCauses.callingMethodOnNull'),
      ],
      fix: t('console.errorFix.checkVariableType'),
      docsUrl: 'https://docs.rpaforge.dev/variables/types',
    },
    'AttributeError': {
      causes: [
        t('console.errorCauses.objectNoAttribute'),
        t('console.errorCauses.wrongObjectType'),
      ],
      fix: t('console.errorFix.verifyObjectStructure'),
      docsUrl: 'https://docs.rpaforge.dev/variables/types',
    },
    'ValueError': {
      causes: [
        t('console.errorCauses.invalidArgumentValue'),
        t('console.errorCauses.wrongDataFormat'),
      ],
      fix: t('console.errorFix.checkExpectedFormat'),
      docsUrl: 'https://docs.rpaforge.dev/activities/parameters',
    },
    'KeyError': {
      causes: [
        t('console.errorCauses.dictionaryKeyDoesNotExist'),
        t('console.errorCauses.typoInKeyName'),
      ],
      fix: t('console.errorFix.verifyDictionaryKey'),
      docsUrl: 'https://docs.rpaforge.dev/variables/dictionaries',
    },
    'IndexError': {
      causes: [
        t('console.errorCauses.listIndexOutOfRange'),
        t('console.errorCauses.emptyList'),
      ],
      fix: t('console.errorFix.checkListLength'),
      docsUrl: 'https://docs.rpaforge.dev/variables/lists',
    },
    'Invalid selector': {
      causes: [
        t('console.errorCauses.xpathCssSyntaxError'),
        t('console.errorCauses.elementRemovedFromDom'),
      ],
      fix: t('console.errorFix.testSelectorInBrowser'),
      docsUrl: 'https://docs.rpaforge.dev/webui/selectors',
    },
    'WebDriverException': {
      causes: [
        t('console.errorCauses.browserClosedUnexpectedly'),
        t('console.errorCauses.browserDriverMismatch'),
      ],
      fix: t('console.errorFix.restartBrowser'),
      docsUrl: 'https://docs.rpaforge.dev/webui/troubleshooting',
    },
    'SQL': {
      causes: [
        t('console.errorCauses.syntaxErrorInQuery'),
        t('console.errorCauses.tableColumnNotExist'),
        t('console.errorCauses.databaseConnectionLost'),
      ],
      fix: t('console.errorFix.checkSqlSyntax'),
      docsUrl: 'https://docs.rpaforge.dev/database/errors',
    },
    'Database': {
      causes: [
        t('console.errorCauses.connectionStringIncorrect'),
        t('console.errorCauses.databaseServerNotRunning'),
        t('console.errorCauses.authenticationFailed'),
      ],
      fix: t('console.errorFix.verifyConnectionCredentials'),
      docsUrl: 'https://docs.rpaforge.dev/database/connection',
    },
  };
}

function matchSuggestion(message: string, errorSuggestions: Record<string, ErrorSuggestion>): ErrorSuggestion | null {
  for (const [key, suggestion] of Object.entries(errorSuggestions)) {
    if (message.toLowerCase().includes(key.toLowerCase())) {
      return suggestion;
    }
  }
  return null;
}

const LogLevelBadge: React.FC<{ level: LogLevel }> = ({ level }) => {
  const { t } = useTranslation('common');
  const colors: Record<LogLevel, string> = {
    error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    debug: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    trace: 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-500',
  };

  return (
    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${colors[level]}`}>
      {t(`console.${level}`)}
    </span>
  );
};

const ErrorCard: React.FC<{ entry: LogEntry }> = ({ entry }) => {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const errorSuggestions = useErrorSuggestions();
  const suggestion = matchSuggestion(entry.message, errorSuggestions);
  const details = entry.details as Record<string, string> | undefined;

  const handleReportIssue = () => {
    const url = buildIssueReportUrl(entry.message, details, entry.timestamp);
    window.open(url, '_blank', 'noopener,noreferrer');
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
          {t('console.activity')}: {details.activityName}
          {details.library && <span className="ml-2">{t('console.library')}: {details.library}</span>}
        </div>
      )}
      {expanded && suggestion && (
        <div className="px-8 pb-2 space-y-2">
          <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">{t('console.possibleCauses')}</div>
          <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc list-inside space-y-0.5">
            {suggestion.causes.map((cause) => (
              <li key={cause}>{cause}</li>
            ))}
          </ul>
          <div className="text-xs text-indigo-600 dark:text-indigo-400">
            {t('console.suggestedFix')}: {suggestion.fix}
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
              {t('console.viewDocumentation')}
            </a>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-red-200 dark:border-red-800">
            <button
              onClick={handleReportIssue}
              className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              <FiMessageSquare className="w-3 h-3" />
              {t('console.reportIssue')}
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

function RunSeparator({ runNumber, timestamp }: { runNumber: number; timestamp: Date }) {
  const { t } = useTranslation('common');
  const timeStr = timestamp.toLocaleTimeString();
  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-slate-400 dark:text-slate-500 select-none">
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      <span>{t('console.runSeparator', { runNumber, time: timeStr })}</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}

const ConsoleOutput: React.FC = () => {
  const { t } = useTranslation('common');
  const logs = useConsoleStore((state) => state.logs);
  const filter = useConsoleStore((state) => state.filter);
  const searchQuery = useConsoleStore((state) => state.searchQuery);
  const autoScroll = useConsoleStore((state) => state.autoScroll);
  const clearLogs = useConsoleStore((state) => state.clearLogs);
  const toggleFilterLevel = useConsoleStore((state) => state.toggleFilterLevel);
  const setSearchQuery = useConsoleStore((state) => state.setSearchQuery);
  const setAutoScroll = useConsoleStore((state) => state.setAutoScroll);
  const exportLogs = useConsoleStore((state) => state.exportLogs);
  const currentRunId = useConsoleStore((state) => state.currentRunId);
  const showCurrentRunOnly = useConsoleStore((state) => state.showCurrentRunOnly);
  const setShowCurrentRunOnly = useConsoleStore((state) => state.setShowCurrentRunOnly);

  const [inputValue, setInputValue] = useState(searchQuery);
  const debouncedSearch = useDebounce(inputValue, 150);

  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch, setSearchQuery]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);

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

    if (showCurrentRunOnly) {
      const currentRunId = logs.filter((l) => l.runId).at(-1)?.runId;
      if (currentRunId) {
        filtered = filtered.filter((log) => log.runId === currentRunId);
      }
    }

    return filtered;
  }, [logs, filter, searchQuery, showCurrentRunOnly]);

  const runNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 0;
    for (const log of logs) {
      if (log.runId && !map.has(log.runId)) {
        map.set(log.runId, ++counter);
      }
    }
    return map;
  }, [logs]);

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
              aria-pressed={filter.includes(level)}
            >
               {t('console.' + level)}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <FiSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('console.searchPlaceholder')}
            className="w-full pl-8 pr-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            aria-label={t('console.searchPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {currentRunId && (
            <span className="px-2 py-0.5 text-xs font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
              {t('consoleExtra.run')} {currentRunId.slice(0, 8)}
            </span>
          )}
          <button
            onClick={() => setShowCurrentRunOnly(!showCurrentRunOnly)}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
              showCurrentRunOnly
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
            title={t('consoleExtra.showCurrentRunOnly')}
          >
            <FiLayers className="w-3 h-3" />
            <span>{showCurrentRunOnly ? t('consoleExtra.currentRun') : t('consoleExtra.allRuns')}</span>
          </button>
          <button
            className={`p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 ${
              autoScroll ? 'text-indigo-500' : 'text-slate-400'
            }`}
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? t('console.autoScrollEnabled') : t('console.autoScrollDisabled')}
          >
            <span className="text-xs">↓</span>
          </button>
          <button
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={handleExport}
            title={t('console.exportLogs')}
          >
            <FiDownload className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={clearLogs}
            title={t('console.clearLogs')}
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="console-output flex-1 overflow-hidden bg-white dark:bg-slate-900" role="log" aria-live="polite" aria-label={t('consoleExtra.ariaLabel')}>
        {filteredLogs.length === 0 ? (
          <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8 px-4">
            {logs.length === 0 ? (
              <>
                {t('console.noLogsAvailable')}
                <div className="text-xs mt-1">{t('console.runProcessForOutput')}</div>
              </>
            ) : (
              t('console.noLogsMatchFilter')
            )}
          </div>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            style={{ height: '100%' }}
            data={filteredLogs}
            followOutput={autoScroll ? 'smooth' : false}
            itemContent={(index, entry) => {
              const prevEntry = filteredLogs[index - 1];
              const showSeparator = entry.runId && (!prevEntry || prevEntry.runId !== entry.runId);
              return (
                <React.Fragment key={entry.id}>
                  {showSeparator && (
                    <RunSeparator
                      runNumber={runNumberMap.get(entry.runId!) ?? 1}
                      timestamp={entry.timestamp}
                    />
                  )}
                  <LogLine entry={entry} index={index} />
                </React.Fragment>
              );
            }}
          />
        )}
      </div>

      <div className="console-footer flex items-center justify-between px-2 py-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <span>
          {t('console.entriesOf', { count: filteredLogs.length, total: logs.length })}
        </span>
        <span>{t('console.maxEntries')}</span>
      </div>
    </div>
  );
};

export default ConsoleOutput;
