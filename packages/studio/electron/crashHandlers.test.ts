// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';
import {
  createCrashHandlers,
  describeCrashReason,
  installCrashHandlers,
  type CrashHandlerDeps,
} from './crashHandlers';
import type { Logger } from '../src/utils/logger';

function makeDeps(overrides: Partial<CrashHandlerDeps> = {}): CrashHandlerDeps & {
  events: Array<{ kind: string; message: string }>;
  rendererEvents: Array<{ kind: string; message: string }>;
  dialogs: string[];
  exits: number[];
} {
  const events: Array<{ kind: string; message: string }> = [];
  const rendererEvents: Array<{ kind: string; message: string }> = [];
  const dialogs: string[] = [];
  const exits: number[] = [];
  const deps: CrashHandlerDeps = {
    logger: { error: vi.fn() } as unknown as Logger,
    recordEvent: async (kind, message) => {
      events.push({ kind, message });
    },
    notifyRenderer: (event) => {
      rendererEvents.push(event);
    },
    showErrorDialog: (title, message) => {
      dialogs.push(`${title}: ${message}`);
    },
    sessionLogPath: () => 'C:/session/security-audit.log',
    exit: (code) => {
      exits.push(code);
    },
    ...overrides,
  };
  return { ...deps, events, rendererEvents, dialogs, exits } as ReturnType<
    typeof makeDeps
  >;
}

describe('crashHandlers (issue #827)', () => {
  test('unhandled rejection logs, audits, toasts and keeps the app alive', async () => {
    const deps = makeDeps();
    const handlers = createCrashHandlers(deps);

    handlers.handleUnhandledRejection(new Error('ipc promise blew up'));
    await vi.waitFor(() => expect(deps.events).toHaveLength(1));

    expect(deps.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('unhandledRejection'),
    );
    expect(deps.events[0]).toMatchObject({
      kind: 'unhandledRejection',
    });
    expect(deps.events[0].message).toContain('ipc promise blew up');
    expect(deps.rendererEvents).toEqual([
      { kind: 'unhandledRejection', message: expect.stringContaining('ipc promise blew up') },
    ]);
    // The app must survive unhandled rejections.
    expect(deps.exits).toEqual([]);
    expect(deps.dialogs).toEqual([]);
  });

  test('uncaught exception audits, shows the dialog with log path and exits', async () => {
    const deps = makeDeps();
    const handlers = createCrashHandlers(deps);

    handlers.handleUncaughtException(new Error('fatal renderer state'));
    await vi.waitFor(() => expect(deps.events).toHaveLength(1));

    expect(deps.events[0].kind).toBe('uncaughtException');
    expect(deps.dialogs).toHaveLength(1);
    expect(deps.dialogs[0]).toContain('C:/session/security-audit.log');
    expect(deps.dialogs[0]).toContain('fatal renderer state');
    expect(deps.exits).toEqual([1]);
  });

  test('non-Error rejection reasons are stringified', () => {
    expect(describeCrashReason('plain string')).toBe('plain string');
    expect(describeCrashReason(42)).toBe('42');
    const err = new Error('with stack');
    expect(describeCrashReason(err)).toContain('with stack');
  });

  test('installCrashHandlers registers both process listeners', () => {
    const deps = makeDeps();
    const listeners: Record<string, unknown> = {};
    const fakeProcess = {
      on: vi.fn((event: string, handler: unknown) => {
        listeners[event] = handler;
      }),
    } as unknown as NodeJS.Process;

    installCrashHandlers(deps, fakeProcess);

    expect(Object.keys(listeners).sort()).toEqual([
      'uncaughtException',
      'unhandledRejection',
    ]);
  });
});
