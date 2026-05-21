import { vi } from 'vitest';

vi.mock('i18next', () => {
  const i18nMock: Record<string, unknown> = {
    use: () => i18nMock,
    init: vi.fn().mockResolvedValue(undefined),
    t: (key: string, options?: Record<string, unknown> | string): string => {
      const defaultValue =
        typeof options === 'string'
          ? options
          : (options?.defaultValue as string | undefined);
      return defaultValue ?? key;
    },
    isInitialized: true,
    language: 'en',
    languages: ['en'],
    exists: () => false,
    changeLanguage: vi.fn().mockResolvedValue(undefined),
  };
  return { default: i18nMock };
});

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
  'common:validation.loadDiagramOneStart': 'Failed to load diagram: every diagram must contain exactly one Start node.',
  'common:errors.diagramAlreadyHasStart': 'Diagram already contains a Start node. Remove the existing Start before adding another one.',
  'common:errors.mustKeepOneStart': 'Diagram must always keep exactly one Start node. Add a replacement Start first.',
};

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  withTranslation: (_ns: string) => (Component: any) => {
    const WrappedComponent = (props: any) => (
      <Component {...props} t={buildT(TRANSLATIONS)} />
    );
    WrappedComponent.displayName = `withTranslation(${_ns})`;
    return WrappedComponent;
  },
  useTranslation: (_ns?: string) => ({
    t: buildT(TRANSLATIONS),
    i18n: { language: 'en' },
  }),
  getI18n: () => ({ t: buildT(TRANSLATIONS) }),
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
