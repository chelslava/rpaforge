/**
 * Execution audit + template registry IPC handlers (extracted from
 * main.ts, issue #828).
 */

import { ipcMain, app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateSafeString, validateIPCPayload } from '../ipc-validator';
import { readSecurityEvents } from '../audit/securityAudit';
import { fetchTemplateRegistry } from '../templates/registry';
import { createLogger } from '../../src/utils/logger';

const logger = createLogger('ipc-audit');

const RUNS_DIR = () => path.join(app.getPath('home'), '.rpaforge', 'runs');

export function registerAuditHandlers(): void {
  // Execution audit log handlers
  ipcMain.handle(IPC_CHANNELS.AUDIT_RUNS_LIST, async (event) => {
    validateIPCPayload(event, 'audit:runsList', {});
    try {
      const runsDir = RUNS_DIR();
      if (!fs.existsSync(runsDir)) {
        return [];
      }

      const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json'));
      const runs = files
        .sort()
        .reverse()
        .slice(0, 50)
        .map((filename) => {
          const filepath = path.join(runsDir, filename);
          const stats = fs.statSync(filepath);
          return {
            filename,
            size: stats.size,
            modified: stats.mtime.toISOString(),
          };
        });

      return runs;
    } catch (error) {
      logger.error('Failed to list audit runs', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_RUNS_GET, async (event, filename: string) => {
    validateIPCPayload(event, 'audit:runsGet', { runId: filename });
    try {
      validateSafeString(filename, 'run filename');
      const runsDir = RUNS_DIR();
      const filepath = path.join(runsDir, filename);

      // Prevent directory traversal
      if (!filepath.startsWith(runsDir)) {
        throw new Error('Invalid path');
      }

      if (!fs.existsSync(filepath)) {
        throw new Error('Run file not found');
      }

      const content = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to get audit run ${filename}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_RUNS_DELETE, async (event, filename: string) => {
    validateIPCPayload(event, 'audit:runsDelete', { runId: filename });
    try {
      validateSafeString(filename, 'run filename');
      const runsDir = RUNS_DIR();
      const filepath = path.join(runsDir, filename);

      // Prevent directory traversal
      if (!filepath.startsWith(runsDir)) {
        throw new Error('Invalid path');
      }

      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete audit run ${filename}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.AUDIT_SECURITY_LIST, async (event) => {
    validateIPCPayload(event, 'audit:securityList', {});
    return readSecurityEvents();
  });

  // Aggregate permission-policy violations from persisted run records
  // (issue #844): each run JSON carries a redacted policy_violations array.
  ipcMain.handle(IPC_CHANNELS.AUDIT_POLICY_VIOLATIONS, async (event) => {
    validateIPCPayload(event, 'audit:policyViolations', {});
    try {
      const runsDir = RUNS_DIR();
      if (!fs.existsSync(runsDir)) {
        return [];
      }
      const violations: Array<{
        filename: string;
        processName: string;
        startedAt: string;
        finishedAt: string | null;
        status: string;
        violations: Array<Record<string, unknown>>;
      }> = [];
      const files = fs.readdirSync(runsDir).filter((f) => f.endsWith('.json')).sort().reverse();
      for (const filename of files) {
        const filepath = path.join(runsDir, filename);
        if (!filepath.startsWith(runsDir)) continue;
        try {
          const run = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as {
            process_name?: string;
            started_at?: string;
            finished_at?: string | null;
            status?: string;
            policy_violations?: Array<Record<string, unknown>>;
          };
          if (Array.isArray(run.policy_violations) && run.policy_violations.length > 0) {
            violations.push({
              filename,
              processName: run.process_name ?? 'Unknown',
              startedAt: run.started_at ?? '',
              finishedAt: run.finished_at ?? null,
              status: run.status ?? 'unknown',
              violations: run.policy_violations,
            });
          }
        } catch {
          // Skip unreadable run records.
        }
      }
      return violations;
    } catch (error) {
      logger.error('Failed to list policy violations', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.TEMPLATES_GET_REGISTRY, async (event) => {
    validateIPCPayload(event, 'templates:getRegistry', {});
    return fetchTemplateRegistry();
  });
}
