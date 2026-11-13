import React from 'react';
import { vi } from 'vitest';

vi.mock('i18next-http-backend', () => ({
  default: {
    type: 'backend' as const,
    init: vi.fn(),
    read: (_lng: string, _ns: string, cb: (err: null, data: Record<string, string>) => void) => cb(null, {}),
    readMulti: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('i18next-browser-languagedetector', () => ({
  default: {
    type: 'languageDetector' as const,
    async: false,
    init: vi.fn(),
    detect: () => 'en',
    cacheUserLanguage: vi.fn(),
  },
}));

const buildT = (translations: Record<string, string>) =>
  (key: string, options?: Record<string, unknown>): string => {
    let result = translations[key] ?? (options?.defaultValue as string) ?? key;
    if (options) {
      result = result.replace(/\{\{(\w+)\}\}/g, (_, k) => String(options[k] ?? `{{${k}}}`));
    }
    return result;
  };

const TRANSLATIONS: Record<string, string> = {
  'orchestrator.title': 'Control Tower',
  'orchestrator.tabs.runs': 'Runs',
  'orchestrator.tabs.queues': 'Queues',
  'orchestrator.tabs.schedules': 'Schedules',
  'orchestrator.tabs.connections': 'Connections',
  'orchestrator.health.unknown': 'Unknown',
  'orchestrator.health.healthy': 'Healthy',
  'orchestrator.health.unreachable': 'Unreachable',
  'orchestrator.health.auth-error': 'Auth error',
  'orchestrator.health.unsupported': 'Unsupported',
  'orchestrator.runs.filterAll': 'All statuses',
  'orchestrator.runs.selectHint': 'Select a run to see its step timing and logs.',
  'orchestrator.runs.stepsTitle': 'Steps',
  'orchestrator.runs.stepActivity': 'Activity',
  'orchestrator.runs.stepStatus': 'Status',
  'orchestrator.runs.stepDuration': 'Duration',
  'orchestrator.runs.cancel': 'Cancel',
  'orchestrator.runs.runNow': 'Run…',
  'orchestrator.runs.autoRefresh': 'Auto-refresh',
  'orchestrator.runs.autoRefreshOff': 'Auto-refresh: off',
  'orchestrator.runs.autoRefresh5': 'Every 5 s',
  'orchestrator.runs.autoRefresh15': 'Every 15 s',
  'orchestrator.runs.runFormPath': 'Diagram path on the runner host',
  'orchestrator.runs.runFormSubmit': 'Queue run',
  'orchestrator.runs.triggerQueued': 'Queued: {{itemId}}',
  'orchestrator.runs.logTitle': 'Logs',
  'orchestrator.runs.logMissing': 'No log file for this run yet.',
  'orchestrator.queues.New': 'New',
  'orchestrator.queues.InProgress': 'In progress',
  'orchestrator.queues.Retried': 'Retried',
  'orchestrator.queues.Successful': 'Successful',
  'orchestrator.queues.Failed': 'Failed',
  'orchestrator.queues.DeadLetter': 'Dead letter',
  'orchestrator.queues.deadLetterTitle': 'Dead-letter items',
  'orchestrator.queues.requeueAll': 'Requeue all',
  'orchestrator.queues.requeueItem': 'Requeue item {{id}}',
  'orchestrator.queues.deadLetterEmpty': 'No dead-letter items.',
  'orchestrator.schedules.unsupported': 'Schedule management requires the daemon to run with --schedules.',
  'orchestrator.schedules.new': 'New schedule',
  'orchestrator.schedules.lastRun': 'Last enqueued: {{time}}',
  'orchestrator.schedules.delete': 'Delete schedule {{name}}',
  'orchestrator.schedules.confirmDelete': 'Confirm delete',
  'orchestrator.connections.tokenSet': 'Token set',
  'orchestrator.connections.tokenMissing': 'No token',
  'orchestrator.connections.empty': 'No daemon connections yet. Add one to start monitoring runs.',
  'orchestrator.metrics.title': 'Host',
  'orchestrator.metrics.uptime': 'Uptime',
  'orchestrator.cron.everyMinutes': 'Every {{n}} min',
  'orchestrator.cron.hourly': 'Hourly at :{{minute}}',
  'orchestrator.cron.everyDay': 'Every day at {{h}}:{{m}}',
  'orchestrator.cron.weekdays': 'Weekdays at {{h}}:{{m}}',
  'orchestrator.cron.monthly': 'Monthly on the 1st at {{h}}:{{m}}',
  'orchestrator.cron.hourRangeWeekdays': 'Hourly {{from}}:00–{{to}}:00 on weekdays',
  'orchestrator.cron.raw': 'Cron schedule',
  'common.run': 'Run',
  'common.export': 'Export',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.delete': 'Delete',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.duplicate': 'Duplicate',
  'common.copy': 'Copy',
  'common.paste': 'Paste',
  'common.cut': 'Cut',
  'common.select': 'Select',
  'common.select_all': 'Select All',
  'common.deselect': 'Deselect',
  'common.clear': 'Clear',
  'common.refresh': 'Refresh',
  'common.settings': 'Settings',
  'common.help': 'Help',
  'common.about': 'About',
  'palette.title': 'Blocks & Activities',
  'palette.search': 'Search blocks and activities...',
  'status.ready': 'Ready',
  'status.running': 'Running...',
  'status.paused': 'Paused',
  'status.stopped': 'Stopped',
  'status.completed': 'Completed',
  'status.failed': 'Failed',
  'status.opening': 'Opening...',
  'status.saving': 'Saving...',
  'status.unsaved': 'Unsaved changes',
  'status.saved': 'Saved {{time}}',
  'status.history': 'History',
  'status.undo': 'Undo',
  'status.redo': 'Redo',
  'status.undoHint': 'Undo the last change',
  'status.redoHint': 'Redo the last undone change',
  'status.hideConsole': 'Hide Console',
  'status.showConsole': 'Show Console',
  'status.bridge': 'Bridge:',
  'status.capabilitiesUnavailable': 'Capabilities unavailable',
  'status.engine': 'Engine',
  'status.debugger': 'Debugger',
  'status.noDebugger': 'No debugger',
  'status.libraries': 'libraries',
  'status.reconnecting': 'Reconnecting...',
  'status.degraded': 'Degraded ({{failures}} hb failures)',
  'status.hbFailures': 'hb failures',
  'status.runtimeSummary': 'Engine {{version}} | {{debuggerStatus}} | {{libraryCount}} libraries',
  'status.debuggerPresent': 'Debugger',
  'status.debuggerMissing': 'No debugger',
  'dialogs.storage': 'Storage',
  'propertyEditors.switch.cases': 'Cases',
  'propertyEditors.switch.addCase': 'Add case',
  'propertyEditors.switch.label': 'Label',
  'propertyEditors.switch.value': 'Value',
  'propertyEditors.switch.caseN': 'Case {{n}}',
  'propertyEditors.switch.noCases': 'No cases',
  'propertyEditors.switch.expression': 'Expression',
  'propertyEditors.subDiagram.openDiagram': 'Open diagram',
  'propertyEditors.subDiagramCallBlock.tooltip': 'Sub-diagram call',
  'subDiagramCallBlock.inputs': 'Inputs',
  'subDiagramCallBlock.outputs': 'Outputs',
  'propertyEditors.tryCatch.addHandler': 'Add handler',
  'propertyEditors.tryCatch.removeHandler': 'Remove handler',
  'propertyEditors.tryCatch.handlers': 'Exception handlers',
  'propertyEditors.tryCatch.handlerN': 'Handler {{n}}',
  'propertyEditors.tryCatch.exceptionType': 'Exception type',
  'propertyEditors.tryCatch.variable': 'Variable',
  'propertyEditors.tryCatch.enableFinally': 'Enable FINALLY path',
  'propertyEditors.tryCatch.noHandlers': 'No handlers configured',
  'propertyEditors.tryCatch.exceptionVariablePlaceholder': 'err',
  'tryCatch_handlers': 'Exception handlers',
  'tryCatch_handlerLabel': 'Handler {{index}}',
  'tryCatch_exceptionType': 'Exception type',
  'tryCatch_variable': 'Variable',
  'tryCatch_finallyDescription': 'FINALLY block executes regardless of exception',
  'enable_finally': 'Enable FINALLY path',
  'gitSourceControl.diagramDiffKind_added': 'Added {{node}}',
  'gitSourceControl.diagramDiffKind_removed': 'Removed {{node}}',
  'gitSourceControl.diagramDiffKind_modified': 'Changed {{node}}',
  'gitSourceControl.diagramDiffKind_moved': 'Moved {{node}}',
  'gitSourceControl.diagramDiffNoChanges': 'No structural changes.',
  'gitSourceControl.mergeAutoMerged': 'Auto-merged',
  'gitSourceControl.mergeAutoSummary': '{{nodes}} node and {{edges}} link changes applied from both sides.',
  'gitSourceControl.mergeConflictsSection': 'Conflicts ({{count}})',
  'gitSourceControl.mergeNoConflicts': 'No conflicts - both sides merged cleanly.',
  'gitSourceControl.mergeKeepOurs': 'Keep ours',
  'gitSourceControl.mergeKeepTheirs': 'Take theirs',
  'gitSourceControl.mergeApplyResolved': 'Apply & mark resolved',
  'gitSourceControl.mergeApplied': 'Resolved and staged',
  'gitSourceControl.mergeConflict_node-field': 'Changed on both sides',
  'gitSourceControl.mergeConflict_node-add': 'Added on both sides',
  'gitSourceControl.mergeConflict_node-delete': 'Deleted vs changed',
  'gitSourceControl.mergeConflict_edge': 'Link conflict',
  'gitSourceControl.mergeConflict_metadata': 'Metadata conflict',
  'gitSourceControl.mergeConflict_variable': 'Variable conflict',
  'errors.somethingWentWrong': 'Something went wrong',
  'errors.somethingWentWrongDesc': 'Please try again later.',
  'errors.tryAgain': 'Try Again',
  'errors.reloadPage': 'Reload Page',
  'execution.startingProcess': 'Starting process...',
  'execution.noEndBlock': 'Process has no End block — execution may not terminate cleanly',
  'execution.processStarted': 'Process started',
  'execution.noProcessMetadata': 'No process metadata',
  'execution.createOrLoadFirst': 'Please create or load a process first.',
  'execution.executionFailed': 'Execution failed',
  'execution.failedToRun': 'Failed to run process.',
  'execution.autoConnectFailed': 'Auto-connect failed',
  'execution.unableToConnect': 'Unable to connect to Python engine',
  'execution.bridgeConnectionFailed': 'Bridge connection failed',
  'execution.stepOverFailed': 'Step over failed',
  'execution.unableToStepOver': 'Unable to step over',
  'execution.stepIntoFailed': 'Step into failed',
  'execution.unableToStepInto': 'Unable to step into',
  'execution.stepOutFailed': 'Step out failed',
  'execution.unableToStepOut': 'Unable to step out',
  'execution.codeGenerationFailed': 'Code generation failed',
  'execution.unableToGenerateCode': 'Unable to generate code',
  'execution.refreshDebuggerFailed': 'Failed to refresh debugger state',
  'execution.failedToGenerate': 'Failed to generate Python code',
  'exceptionTypes.Exception': 'Exception',
  'exceptionTypes.ValueError': 'ValueError',
  'exceptionTypes.TypeError': 'TypeError',
  'exceptionTypes.RuntimeError': 'RuntimeError',
  'exceptionTypes.KeyError': 'KeyError',
  'exceptionTypes.IndexError': 'IndexError',
  'exceptionTypes.AttributeError': 'AttributeError',
  'exceptionTypes.ImportError': 'ImportError',
  'exceptionTypes.OSError': 'OSError',
  'exceptionTypes.TimeoutError': 'TimeoutError',
  'exceptionTypes.FileNotFoundError': 'FileNotFoundError',
  'exceptionTypes.PermissionError': 'PermissionError',
  'exceptionTypes.ConnectionError': 'ConnectionError',
};

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  withTranslation: (_ns: string) => (Component: React.ComponentType<Record<string, unknown>>) => {
    const WrappedComponent = (props: Record<string, unknown>) => (
      <Component {...props} t={buildT(TRANSLATIONS)} />
    );
    WrappedComponent.displayName = `withTranslation(${_ns})`;
    return WrappedComponent;
  },
  useTranslation: (_ns?: string) => ({
    t: buildT(TRANSLATIONS),
    i18n: { language: 'en' },
  }),
}));

if (typeof window !== 'undefined') {
  (window as unknown as { clearStorage: () => void }).clearStorage = () => {
    localStorage.clear();
    sessionStorage.clear();
  };
  if (!window.requestIdleCallback) {
    const originalSetTimeout = window.setTimeout;
    window.requestIdleCallback = ((cb: IdleRequestCallback) => {
      return originalSetTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0) as unknown as number;
    }) as typeof window.requestIdleCallback;
    window.cancelIdleCallback = ((handle: number) => {
      clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
    }) as typeof window.cancelIdleCallback;
  }
  if (typeof window.indexedDB === 'undefined') {
    const mockStore = () => ({
      put: () => ({ onsuccess: null, onerror: null }),
      get: () => ({ onsuccess: null, onerror: null, result: undefined }),
      delete: () => ({ onsuccess: null, onerror: null }),
      clear: () => ({ onsuccess: null, onerror: null }),
      getAll: () => ({ onsuccess: null, onerror: null, result: [] }),
      index: () => ({
        getAll: () => ({ onsuccess: null, onerror: null, result: [] }),
        openCursor: () => ({ onsuccess: null, onerror: null }),
      }),
      createIndex: () => {},
    });
    const mockDB = {
      objectStoreNames: { contains: () => false },
      createObjectStore: () => mockStore(),
      transaction: () => ({
        objectStore: mockStore,
        oncomplete: null,
        onerror: null,
        onabort: null,
      }),
      oncomplete: null,
      onerror: null,
    };
    window.indexedDB = {
      open: (_name: string, _version: number) => {
        const req = {
          onsuccess: null as (() => void) | null,
          onerror: null as (() => void) | null,
          result: mockDB,
        };
        setTimeout(() => {
          if (req.onsuccess) {
            req.onsuccess();
          }
        }, 0);
        return req;
      },
      deleteDatabase: () => ({
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      }),
    } as unknown as IDBFactory;
  }
}
