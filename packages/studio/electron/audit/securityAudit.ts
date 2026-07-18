import { app } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export type SecurityEventType =
  | 'bridge_restart'
  | 'library_install'
  | 'library_uninstall'
  | 'git_remote_change'
  | 'ai_provider_key_change'
  | 'ai_generation'
  | 'process_execution';

export interface SecurityAuditEvent {
  timestamp: string;
  eventType: SecurityEventType;
  details: Record<string, unknown>;
  sessionId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_EVENTS = 500;
const SESSION_ID = randomUUID();

export function getSecurityAuditPath(homePath = app.getPath('home')): string {
  return path.join(homePath, '.rpaforge', 'security-audit.log');
}

export function anonymize(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const sensitive = /key|token|secret|password|credential|authorization/i.test(key);
      return [key, sensitive ? '[REDACTED]' : sanitize(entry)];
    }),
  );
}

async function rotateIfNeeded(filePath: string): Promise<void> {
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats || stats.size < MAX_FILE_SIZE) return;
  await fs.rename(filePath, `${filePath}.1`).catch(() => undefined);
}

export async function recordSecurityEvent(
  eventType: SecurityEventType,
  details: Record<string, unknown> = {},
  homePath?: string,
): Promise<void> {
  const filePath = getSecurityAuditPath(homePath);
  const event: SecurityAuditEvent = {
    timestamp: new Date().toISOString(),
    eventType,
    details: sanitize(details) as Record<string, unknown>,
    sessionId: SESSION_ID,
  };

  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await rotateIfNeeded(filePath);
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Auditing must never make the protected operation fail.
  }
}

export async function readSecurityEvents(homePath?: string): Promise<SecurityAuditEvent[]> {
  const filePath = getSecurityAuditPath(homePath);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-MAX_EVENTS)
      .flatMap((line) => {
        try {
          const event = JSON.parse(line) as SecurityAuditEvent;
          return event && typeof event.eventType === 'string' ? [event] : [];
        } catch {
          return [];
        }
      })
      .reverse();
  } catch {
    return [];
  }
}
