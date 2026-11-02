// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ipcMain } from 'electron';

import { mockElectron, makeEvent } from './testUtils';

let homeDir = '';

vi.mock('electron', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    app: {
      getPath: vi.fn(() => homeDir),
      isPackaged: false,
    },
  };
});
vi.mock('../audit/securityAudit', () => ({ readSecurityEvents: vi.fn(async () => [{ kind: 'x' }]) }));
vi.mock('../templates/registry', () => ({ fetchTemplateRegistry: vi.fn(async () => ({ templates: [] })) }));

import { registerAuditHandlers } from './auditHandlers';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';

function handler(channel: string) {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    ([name]) => name === channel,
  );
  return call?.[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
}

describe('auditHandlers', () => {
  beforeAll(() => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpaforge-audit-test-'));
    fs.mkdirSync(path.join(homeDir, '.rpaforge', 'runs'), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    registerAuditHandlers();
  });

  test('runsList returns newest run files first with metadata', async () => {
    const runsDir = path.join(homeDir, '.rpaforge', 'runs');
    fs.writeFileSync(path.join(runsDir, 'run-1.json'), '{}');
    fs.writeFileSync(path.join(runsDir, 'run-2.json'), '{}');
    fs.writeFileSync(path.join(runsDir, 'ignore.txt'), '');

    const runs = (await handler(IPC_CHANNELS.AUDIT_RUNS_LIST)(makeEvent())) as Array<{ filename: string; size: number }>;
    expect(runs.map((r) => r.filename)).toEqual(['run-2.json', 'run-1.json']);
    expect(runs[0].size).toBe(2);
  });

  test('runsGet returns the parsed run JSON', async () => {
    const runsDir = path.join(homeDir, '.rpaforge', 'runs');
    fs.writeFileSync(path.join(runsDir, 'run-data.json'), JSON.stringify({ status: 'pass' }));
    const run = await handler(IPC_CHANNELS.AUDIT_RUNS_GET)(makeEvent(), 'run-data.json');
    expect(run).toEqual({ status: 'pass' });
  });

  test('runsGet rejects traversal outside the runs directory', async () => {
    await expect(handler(IPC_CHANNELS.AUDIT_RUNS_GET)(makeEvent(), '../../etc/passwd')).rejects.toThrow();
  });

  test('runsGet rejects missing run files', async () => {
    await expect(handler(IPC_CHANNELS.AUDIT_RUNS_GET)(makeEvent(), 'missing.json')).rejects.toThrow(/not found/);
  });

  test('runsDelete removes the run file and reports success', async () => {
    const runsDir = path.join(homeDir, '.rpaforge', 'runs');
    fs.writeFileSync(path.join(runsDir, 'run-del.json'), '{}');
    const result = await handler(IPC_CHANNELS.AUDIT_RUNS_DELETE)(makeEvent(), 'run-del.json');
    expect(result).toEqual({ success: true });
    expect(fs.existsSync(path.join(runsDir, 'run-del.json'))).toBe(false);
  });

  test('securityList delegates to the audit store', async () => {
    await expect(handler(IPC_CHANNELS.AUDIT_SECURITY_LIST)(makeEvent())).resolves.toEqual([{ kind: 'x' }]);
  });

  test('templates registry delegates to the fetcher', async () => {
    await expect(handler(IPC_CHANNELS.TEMPLATES_GET_REGISTRY)(makeEvent())).resolves.toEqual({ templates: [] });
  });
});
