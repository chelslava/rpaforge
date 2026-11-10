/**
 * Electron main process entry point.
 *
 * Since #828 this file is intentionally thin: it wires the app lifecycle
 * (crash policy, window, Python bridge, spy shortcuts) and registers the
 * IPC handler domains from ./ipc/*. Handler implementation and review live
 * in the domain modules; the IPC payload validation stays at each module's
 * boundary (ipc-validator).
 */

import { app, BrowserWindow, dialog, globalShortcut } from 'electron';
import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import { createLogger } from '../src/utils/logger';
import { installCrashHandlers } from './crashHandlers';
import { recordSecurityEvent, getSecurityAuditPath } from './audit/securityAudit';
import {
  createWindow,
  getMainWindow,
} from './windows';
import {
  getPythonBridge,
  initializePythonBridge,
  restartBridge,
  stopPythonBridge,
} from './bridgeLauncher';
import { setupSpyShortcuts } from './spyOverlay';
import { closeAllFsWatchers } from './ipc/fsHandlers';
import { registerBridgeHandlers } from './ipc/bridgeHandlers';
import { registerEngineHandlers } from './ipc/engineHandlers';
import { registerAuditHandlers } from './ipc/auditHandlers';
import { registerFsHandlers } from './ipc/fsHandlers';
import { registerLogHandlers } from './ipc/logHandlers';
import { registerAiHandlers } from './ipc/aiHandlers';
import { registerGitHandlers } from './ipc/gitHandlers';
import { registerSecretHandlers } from './ipc/secretHandlers';
import { registerOrchestratorHandlers } from './ipc/orchestratorHandlers';
import { registerLibrariesHandlers } from './ipc/librariesHandlers';
import { registerSpyHandlers } from './ipc/spyHandlers';
import { registerAppUpdateHandlers } from './ipc/updateHandlers';
import { createAppUpdateManager } from './appUpdate';
import type { IpcContext } from './ipc/context';

const logger = createLogger('electron-main');

const ipcContext: IpcContext = {
  getMainWindow,
  getPythonBridge,
  restartBridge,
};

function setupIPCHandlers(): void {
  registerBridgeHandlers(ipcContext);
  registerEngineHandlers(ipcContext);
  registerAuditHandlers();
  registerFsHandlers(ipcContext);
  registerLogHandlers();
  registerAiHandlers(ipcContext);
  registerGitHandlers();
  registerSecretHandlers();
  registerOrchestratorHandlers();
  registerLibrariesHandlers(ipcContext);
  registerSpyHandlers(ipcContext);
}

// Process-level crash/rejection policy (issue #827): unhandled rejections
// keep the app alive but surface through the security-audit trail and a
// renderer toast; uncaught exceptions show the error dialog with the
// session audit-log path before exiting.
installCrashHandlers({
  logger,
  recordEvent: (kind, message) =>
    recordSecurityEvent(
      kind === 'unhandledRejection'
        ? 'process_unhandled_rejection'
        : 'process_uncaught_exception',
      { message },
    ),
  notifyRenderer: (event) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.APP_ERROR_EVENT, event);
    }
  },
  showErrorDialog: (title, message) => {
    dialog.showErrorBox(title, message);
  },
  sessionLogPath: () => getSecurityAuditPath(),
  exit: (code) => app.exit(code),
});

app.whenReady().then(async () => {
  setupIPCHandlers();
  setupSpyShortcuts(getPythonBridge);
  await initializePythonBridge();
  createWindow();

  // App auto-update (issue #819): the channel preference is persisted by the
  // main process (userData file) — the renderer settings store would drag the
  // i18n bundle into the main bundle, so the update manager owns it instead.
  const appUpdateManager = await createAppUpdateManager(getMainWindow);
  registerAppUpdateHandlers(appUpdateManager);
  appUpdateManager.scheduleStartupCheck();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonBridge();
  closeAllFsWatchers();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBridge();
  closeAllFsWatchers();
  globalShortcut.unregisterAll();
});

app.on('will-quit', (event) => {
  // Give bridge time to drain (SIGTERM → 5s SIGKILL). BridgeState's TS union
  // does not model the transient 'stopping' state, hence the string cast.
  if ((getPythonBridge()?.state as string | undefined) === 'stopping') {
    event.preventDefault();
    setTimeout(() => app.quit(), 3000);
  }
});
