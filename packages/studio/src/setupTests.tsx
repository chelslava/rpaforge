import { vi } from 'vitest';

vi.mock('react-i18next', () => ({
  withTranslation: (ns: string) => (Component: any) => {
    const WrappedComponent = (props: any) => {
      const t = (key: string) => {
        const translations: Record<string, string> = {
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
          'common.status.ready': 'Ready',
          'common.status.running': 'Running...',
          'common.status.paused': 'Paused',
          'common.status.stopped': 'Stopped',
          'common.status.completed': 'Completed',
          'common.status.failed': 'Failed',
          'common.status.opening': 'Opening...',
          'common.status.saving': 'Saving...',
          'common.status.unsaved': 'Unsaved changes',
          'common.status.saved': 'Saved {{time}}',
          'common.status.hideConsole': 'Hide Console',
          'common.status.showConsole': 'Show Console',
          'common.status.bridge': 'Bridge:',
          'common.status.capabilitiesUnavailable': 'Capabilities unavailable',
          'common.status.engine': 'Engine',
          'common.status.debugger': 'Debugger',
          'common.status.noDebugger': 'No debugger',
          'common.status.libraries': 'libraries',
          'common.status.reconnecting': 'Reconnecting...',
          'common.status.degraded': 'Degraded ({{failures}} hb failures)',
          'common.status.hbFailures': 'hb failures',
          'common.status.runtimeSummary': 'Engine {{version}} | {{debuggerStatus}} | {{libraryCount}} libraries',
          'common.status.debuggerPresent': 'Debugger',
          'common.status.debuggerMissing': 'No debugger',
          'common.dialogs.storage': 'Storage',
          'common.tips.quickAdd': 'Press Ctrl+Space to quick-add activities',
          'common.tips.dragConnect': 'Drag edges between blocks to connect them',
          'common.tips.copyPaste': 'Use Ctrl+C/V to copy and paste blocks',
          'common.tips.doubleClick': 'Double-click a block to edit its properties',
          'common.tips.pressF5': 'Press F5 to run your process',
          'common.tips.breakpoints': 'Add breakpoints to debug your workflow',
          'common.tips.variablePanel': 'Use the Variable Panel to watch values',
          'common.tips.exportPython': 'Export your process as Python code',
          'common.tips.saveProject': 'Save your project with Ctrl+S',
          'propertyEditors.switch.cases': 'Cases',
          'propertyEditors.switch.addCase': 'Add case',
          'propertyEditors.switch.label': 'Label',
          'propertyEditors.switch.value': 'Value',
          'propertyEditors.switch.caseN': 'Case {{n}}',
          'propertyEditors.switch.noCases': 'No cases',
          'propertyEditors.switch.expression': 'Expression',
          'propertyEditors.subDiagram.openDiagram': 'Open diagram',
          'propertyEditors.subDiagramCallBlock.tooltip': 'Open diagram',
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
        };
        return translations[key] || key;
      };
      return <Component {...props} t={t} />;
    };
    WrappedComponent.displayName = `withTranslation(${ns})`;
    return WrappedComponent;
  },
  useTranslation: (ns: string) => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
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
        'common.status.ready': 'Ready',
        'common.status.running': 'Running...',
        'common.status.paused': 'Paused',
        'common.status.stopped': 'Stopped',
        'common.status.completed': 'Completed',
        'common.status.failed': 'Failed',
        'common.status.opening': 'Opening...',
        'common.status.saving': 'Saving...',
        'common.status.unsaved': 'Unsaved changes',
        'common.status.saved': 'Saved {{time}}',
        'common.status.hideConsole': 'Hide Console',
        'common.status.showConsole': 'Show Console',
        'common.status.bridge': 'Bridge:',
        'common.status.capabilitiesUnavailable': 'Capabilities unavailable',
        'common.status.engine': 'Engine',
        'common.status.debugger': 'Debugger',
        'common.status.noDebugger': 'No debugger',
        'common.status.libraries': 'libraries',
        'common.status.reconnecting': 'Reconnecting...',
        'common.status.degraded': 'Degraded ({{failures}} hb failures)',
        'common.status.hbFailures': 'hb failures',
        'common.status.runtimeSummary': 'Engine {{version}} | {{debuggerStatus}} | {{libraryCount}} libraries',
        'common.status.debuggerPresent': 'Debugger',
        'common.status.debuggerMissing': 'No debugger',
        'common.dialogs.storage': 'Storage',
        'common.tips.quickAdd': 'Press Ctrl+Space to quick-add activities',
        'common.tips.dragConnect': 'Drag edges between blocks to connect them',
        'common.tips.copyPaste': 'Use Ctrl+C/V to copy and paste blocks',
        'common.tips.doubleClick': 'Double-click a block to edit its properties',
        'common.tips.pressF5': 'Press F5 to run your process',
        'common.tips.breakpoints': 'Add breakpoints to debug your workflow',
        'common.tips.variablePanel': 'Use the Variable Panel to watch values',
        'common.tips.exportPython': 'Export your process as Python code',
        'common.tips.saveProject': 'Save your project with Ctrl+S',
        'propertyEditors.switch.cases': 'Cases',
        'propertyEditors.switch.addCase': 'Add case',
        'propertyEditors.switch.label': 'Label',
        'propertyEditors.switch.value': 'Value',
        'propertyEditors.switch.caseN': 'Case {{n}}',
        'propertyEditors.switch.noCases': 'No cases',
        'propertyEditors.switch.expression': 'Expression',
        'propertyEditors.subDiagram.openDiagram': 'Open diagram',
        'propertyEditors.subDiagramCallBlock.tooltip': 'Open diagram',
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
      };
      return translations[key] || key;
    },
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
