// Process-level crash/rejection handlers for the Electron main process
// (issue #827). Kept as a standalone injectable module so vitest can
// exercise the policy without importing main.ts (which has import-time
// side effects).
//
// Policy:
//   - unhandledRejection: log + security-audit + renderer toast, app stays
//     alive (an unobserved promise failure must not kill a long-running
//     automation session).
//   - uncaughtException: log + security-audit + error dialog showing the
//     session log path, then exit — the main process is in an undefined
//     state and continuing risks silent state corruption.

import type { Logger } from '../src/utils/logger';

export type CrashKind = 'unhandledRejection' | 'uncaughtException';

export interface AppErrorEvent {
  kind: CrashKind;
  message: string;
}

export interface CrashHandlerDeps {
  logger: Logger;
  recordEvent: (kind: CrashKind, message: string) => Promise<void>;
  notifyRenderer: (event: AppErrorEvent) => void;
  showErrorDialog: (title: string, message: string) => void;
  sessionLogPath: () => string;
  exit: (code: number) => void;
}

export interface CrashHandlers {
  handleUnhandledRejection: (reason: unknown) => void;
  handleUncaughtException: (error: unknown) => void;
}

export function describeCrashReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.stack || `${reason.name}: ${reason.message}`;
  }
  return String(reason);
}

export function createCrashHandlers(deps: CrashHandlerDeps): CrashHandlers {
  const report = (kind: CrashKind, reason: unknown) => {
    const message = describeCrashReason(reason);
    deps.logger.error(`Process-level ${kind}: ${message}`);
    void deps.recordEvent(kind, message);
    return message;
  };

  return {
    handleUnhandledRejection: (reason: unknown) => {
      const message = report('unhandledRejection', reason);
      deps.notifyRenderer({ kind: 'unhandledRejection', message });
    },
    handleUncaughtException: (error: unknown) => {
      const message = report('uncaughtException', error);
      deps.showErrorDialog(
        'RPAForge Studio — unexpected error',
        `An unrecoverable error occurred and the app must close.\n\n${message}\n\nSession log: ${deps.sessionLogPath()}`,
      );
      deps.exit(1);
    },
  };
}

export function installCrashHandlers(
  deps: CrashHandlerDeps,
  target: NodeJS.Process = process,
): CrashHandlers {
  const handlers = createCrashHandlers(deps);
  target.on('unhandledRejection', handlers.handleUnhandledRejection);
  target.on('uncaughtException', handlers.handleUncaughtException);
  return handlers;
}
