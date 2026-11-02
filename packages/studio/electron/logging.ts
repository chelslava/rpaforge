/**
 * Application log persistence (extracted from main.ts, issue #828).
 *
 * Ring buffer + rotated NDJSON log file under the user data directory.
 * Consumed by ipc/logHandlers.ts (LOG_* channels).
 */

import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { app } from 'electron';
import type { LogEntry } from '../src/types/ipc-contracts';

const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;

const logBuffer: LogEntry[] = [];
const MAX_BUFFER_SIZE = 100;

export async function ensureLogDir(): Promise<void> {
  try {
    await fsp.mkdir(LOG_DIR, { recursive: true });
  } catch {
    // Ignore if exists
  }
}

export function pushLogBuffer(entry: LogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

/** Snapshot of the in-memory ring buffer (most recent entries last). */
export function getLogBuffer(): LogEntry[] {
  return logBuffer;
}

export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

async function rotateLogs(): Promise<void> {
  try {
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = path.join(LOG_DIR, `app.${i}.log`);
      const newFile = path.join(LOG_DIR, `app.${i + 1}.log`);
      try {
        await fsp.rename(oldFile, newFile);
      } catch {
        // Ignore if doesn't exist
      }
    }
    const firstBackup = path.join(LOG_DIR, 'app.1.log');
    try {
      await fsp.rename(LOG_FILE, firstBackup);
    } catch {
      // Ignore
    }
  } catch {
    // Ignore rotation errors
  }
}

export async function writeLogToFile(entry: LogEntry): Promise<void> {
  try {
    await ensureLogDir();
    const line = JSON.stringify(entry) + '\n';
    const stats = await fsp.stat(LOG_FILE).catch(() => null);

    if (stats && stats.size >= MAX_LOG_SIZE) {
      await rotateLogs();
    }

    await fsp.appendFile(LOG_FILE, line, 'utf-8');
  } catch {
    // Ignore write errors
  }
}

export async function getStoredLogs(filter?: { level?: string; scope?: string }): Promise<LogEntry[]> {
  try {
    const content = await fsp.readFile(LOG_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    let logs: LogEntry[] = lines.map((line) => JSON.parse(line));

    if (filter?.level) {
      logs = logs.filter((l) => l.level === filter.level);
    }
    if (filter?.scope) {
      logs = logs.filter((l) => l.scope === filter.scope);
    }

    return logs;
  } catch {
    return [];
  }
}

export async function exportAllLogs(): Promise<string> {
  try {
    const logs = await getStoredLogs();
    return JSON.stringify(logs, null, 2);
  } catch {
    return '[]';
  }
}

export async function clearStoredLogs(): Promise<void> {
  try {
    await fsp.unlink(LOG_FILE).catch(() => {});
  } catch {
    // Ignore
  }
}
