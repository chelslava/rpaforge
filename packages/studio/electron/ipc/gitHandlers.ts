/**
 * Git IPC handlers (extracted from main.ts, issue #828).
 *
 * Paths are repository-relative (assertRepoRelativePath); remote name/URL
 * are flag-injection-guarded (assertSafeRemoteArg). Both helpers and
 * getGitService moved here verbatim from main.ts.
 */

import { ipcMain } from 'electron';
import * as path from 'node:path';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateIPCPayload, getProjectRoot } from '../ipc-validator';
import { GitService } from '../git/gitService';
import { recordSecurityEvent } from '../audit/securityAudit';

function getGitService(): GitService {
  const root = getProjectRoot();
  if (!root) {
    throw new Error('IPC Security: project root not set — git operation blocked');
  }
  return new GitService(root);
}

/**
 * Git paths are repository-relative and resolved by git inside the repo root
 * (simple-git baseDir). Reject absolute paths and `..` traversal so a path can
 * never escape the repository; further confinement is git's own job.
 */
function assertRepoRelativePath(p: string): void {
  if (typeof p !== 'string' || p.length === 0) {
    throw new Error('Invalid git path');
  }
  if (p.includes('\x00') || /[\x00-\x1F]/.test(p)) {
    throw new Error('Invalid git path: control characters');
  }
  if (path.isAbsolute(p)) {
    throw new Error('Invalid git path: must be repository-relative');
  }
  const normalized = path.normalize(p);
  if (normalized === '..' || normalized.startsWith('..' + path.sep) || normalized.includes(path.sep + '..' + path.sep)) {
    throw new Error('Invalid git path: traversal not allowed');
  }
}

/**
 * Remote name/URL are passed by simple-git directly into the git process argv
 * (no shell), so the only real risk is flag injection via a value starting
 * with `-` (e.g. an url of `--upload-pack=...`).
 */
function assertSafeRemoteArg(value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Invalid git remote argument');
  }
  if (value.includes('\x00') || /[\x00-\x1F]/.test(value)) {
    throw new Error('Invalid git remote argument: control characters');
  }
  if (value.startsWith('-')) {
    throw new Error('Invalid git remote argument: must not start with "-"');
  }
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GIT_IS_REPO, async (event) => {
    validateIPCPayload(event, 'git:isRepo', {});
    return getGitService().isGitRepo();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, async (event) => {
    validateIPCPayload(event, 'git:init', {});
    return getGitService().init();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (event) => {
    validateIPCPayload(event, 'git:status', {});
    return getGitService().status();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_STAGE, async (event, paths: string[]) => {
    validateIPCPayload(event, 'git:stage', { paths });
    paths.forEach((p) => assertRepoRelativePath(p));
    return getGitService().stage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_UNSTAGE, async (event, paths: string[]) => {
    validateIPCPayload(event, 'git:unstage', { paths });
    paths.forEach((p) => assertRepoRelativePath(p));
    return getGitService().unstage(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (event, message: string) => {
    validateIPCPayload(event, 'git:commit', { message });
    return getGitService().commit(message);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (event) => {
    validateIPCPayload(event, 'git:push', {});
    return getGitService().push();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (event) => {
    validateIPCPayload(event, 'git:pull', {});
    return getGitService().pull();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (event, limit?: number) => {
    validateIPCPayload(event, 'git:log', limit === undefined ? {} : { limit });
    return getGitService().log(limit);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DIFF, async (event, filePath: string, staged: boolean) => {
    validateIPCPayload(event, 'git:diff', { filePath, staged });
    assertRepoRelativePath(filePath);
    return getGitService().diff(filePath, staged);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_CURRENT_BRANCH, async (event) => {
    validateIPCPayload(event, 'git:currentBranch', {});
    return getGitService().currentBranch();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_DISCARD_CHANGES, async (event, paths: string[]) => {
    validateIPCPayload(event, 'git:discardChanges', { paths });
    paths.forEach((p) => assertRepoRelativePath(p));
    return getGitService().discardChanges(paths);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_GET_REMOTE_URL, async (event, name?: string) => {
    validateIPCPayload(event, 'git:getRemoteUrl', name === undefined ? {} : { name });
    if (name !== undefined) assertSafeRemoteArg(name);
    return getGitService().getRemoteUrl(name);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_SET_REMOTE_URL, async (event, url: string, name?: string) => {
    validateIPCPayload(event, 'git:setRemoteUrl', name === undefined ? { url } : { url, name });
    assertSafeRemoteArg(url);
    if (name !== undefined) assertSafeRemoteArg(name);
    const result = await getGitService().setRemoteUrl(url, name);
    await recordSecurityEvent('git_remote_change', { remote: name ?? 'origin', urlChanged: true });
    return result;
  });
}
