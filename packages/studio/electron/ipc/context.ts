/**
 * Shared dependency context for IPC domain handler modules (issue #828).
 *
 * Each domain module exports a single `register*Handlers(ctx)` function and
 * reaches main-process state only through this context, so modules stay
 * unit-testable with stubs instead of the real window/bridge singletons.
 */

import type { BrowserWindow } from 'electron';
import type { PythonBridge } from '../python-bridge';

export interface IpcContext {
  getMainWindow(): BrowserWindow | null;
  getPythonBridge(): PythonBridge | null;
  /** BRIDGE_RESTART: restarts the live bridge or re-initializes it. */
  restartBridge(): Promise<void>;
}
