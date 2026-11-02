/**
 * Project filesystem IPC handlers (extracted from main.ts, issue #828).
 *
 * All paths are confined to the project root by validateProjectFilePath at
 * the boundary; directory watchers fan out to the renderer through a
 * debounced sender.
 */

import { ipcMain, shell } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import chokidar, { type FSWatcher } from 'chokidar';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import type { FileInfo } from '../../src/types/ipc-contracts';
import {
  validateSafeString,
  validateIPCPayload,
  setProjectRoot,
  validateProjectFilePath,
  validateProjectRoot,
} from '../ipc-validator';
import { createLogger } from '../../src/utils/logger';
import type { FsEvent } from '../../src/types/events';
import type { IpcContext } from './context';

const logger = createLogger('ipc-fs');

const FS_DEBOUNCE_MS = 100;
const fsWatchers: Map<string, FSWatcher> = new Map();
const debouncedSend: Map<string, NodeJS.Timeout> = new Map();

function debouncedSendEvent(
  ctx: IpcContext,
  channel: string,
  event: FsEvent,
  key: string,
): void {
  const timeoutKey = `${channel}:${key}`;
  const existing = debouncedSend.get(timeoutKey);
  if (existing) {
    clearTimeout(existing);
  }
  const timeout = setTimeout(() => {
    const mainWindow = ctx.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, event);
    }
    debouncedSend.delete(timeoutKey);
  }, FS_DEBOUNCE_MS);
  debouncedSend.set(timeoutKey, timeout);
}

/** Close every directory watcher (app shutdown). */
export function closeAllFsWatchers(): void {
  fsWatchers.forEach((watcher) => watcher.close());
  fsWatchers.clear();
  debouncedSend.forEach((timeout) => clearTimeout(timeout));
  debouncedSend.clear();
}

export function registerFsHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.FS_SET_PROJECT_ROOT, async (event, rootPath: string) => {
    validateSafeString(rootPath, 'rootPath');
    validateIPCPayload(event, 'fs:setProjectRoot', { rootPath });
    // Establish the project directory: for a brand-new project this is where its
    // folder first comes into existence (the renderer sets the root before any
    // file lives in it). Creating it here also breaks the chicken-and-egg with
    // fs:createDir, which requires a project root to already be set.
    await fsp.mkdir(rootPath, { recursive: true });

    // Validate the chosen root without confining it to process.cwd(): the user
    // explicitly picked this folder (e.g. under Documents), and all later file
    // operations are confined to it by validateProjectFilePath.
    const resolved = validateProjectRoot(rootPath, 'rootPath');

    setProjectRoot(resolved);
    logger.info(`Project root set to: ${resolved}`);
  });

  ipcMain.handle(IPC_CHANNELS.FS_PATH_EXISTS, async (event, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:pathExists', { filePath });
    return fs.existsSync(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_DIR, async (event, dirPath: string): Promise<FileInfo[]> => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:readDir', { dirPath });
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      extension: entry.isFile() ? path.extname(entry.name) : '',
    }));
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_FILE, async (event, filePath: string): Promise<string> => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:readFile', { filePath });
    return fsp.readFile(filePath, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_FILE, async (event, filePath: string, content: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateSafeString(content, 'content');
    validateIPCPayload(event, 'fs:writeFile', { filePath, content });
    await fsp.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle(IPC_CHANNELS.FS_READ_BINARY, async (event, filePath: string): Promise<Buffer> => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:readBinary', { filePath });
    return fsp.readFile(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_WRITE_BINARY, async (event, filePath: string, content: Buffer | Uint8Array) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:writeBinary', { filePath });
    await fsp.writeFile(filePath, Buffer.from(content));
  });

  ipcMain.handle(IPC_CHANNELS.FS_CREATE_DIR, async (event, dirPath: string) => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:createDir', { dirPath });
    await fsp.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_DELETE, async (event, targetPath: string, recursive = false) => {
    validateProjectFilePath(targetPath, 'targetPath');
    validateIPCPayload(event, 'fs:delete', { targetPath, recursive });
    await fsp.rm(targetPath, { recursive, force: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_RENAME, async (event, oldPath: string, newPath: string) => {
    validateProjectFilePath(oldPath, 'oldPath');
    validateProjectFilePath(newPath, 'newPath');
    validateIPCPayload(event, 'fs:rename', { oldPath, newPath });
    await fsp.rename(oldPath, newPath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_COPY, async (event, source: string, destination: string) => {
    validateProjectFilePath(source, 'source');
    validateProjectFilePath(destination, 'destination');
    validateIPCPayload(event, 'fs:copy', { source, destination });
    await fsp.cp(source, destination, { recursive: true });
  });

  ipcMain.handle(IPC_CHANNELS.FS_OPEN_WITH_SYSTEM, async (event, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:openWithSystem', { filePath });
    await shell.openPath(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_SHOW_IN_FOLDER, async (event, filePath: string) => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:showInFolder', { filePath });
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.FS_GET_FILE_INFO, async (event, filePath: string): Promise<FileInfo> => {
    validateProjectFilePath(filePath, 'filePath');
    validateIPCPayload(event, 'fs:getFileInfo', { filePath });
    const stats = await fsp.stat(filePath);
    const name = path.basename(filePath);
    return {
      name,
      path: filePath,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      extension: stats.isFile() ? path.extname(name) : '',
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.FS_WATCH_DIR, async (event, dirPath: string) => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:watchDir', { dirPath });
    if (fsWatchers.has(dirPath)) {
      return;
    }

    const watcher = chokidar.watch(dirPath, {
      ignored: /(^|[\\/])\../,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('add', (filePath) => {
      debouncedSendEvent(ctx, IPC_CHANNELS.FS_EVENT, {
        type: 'add',
        path: filePath,
      } as FsEvent, `add:${filePath}`);
    });

    watcher.on('addDir', (filePath) => {
      debouncedSendEvent(ctx, IPC_CHANNELS.FS_EVENT, {
        type: 'addDir',
        path: filePath,
      } as FsEvent, `addDir:${filePath}`);
    });

    watcher.on('change', (filePath) => {
      debouncedSendEvent(ctx, IPC_CHANNELS.FS_EVENT, {
        type: 'change',
        path: filePath,
      } as FsEvent, `change:${filePath}`);
    });

    watcher.on('unlink', (filePath) => {
      debouncedSendEvent(ctx, IPC_CHANNELS.FS_EVENT, {
        type: 'unlink',
        path: filePath,
      } as FsEvent, `unlink:${filePath}`);
    });

    watcher.on('unlinkDir', (filePath) => {
      debouncedSendEvent(ctx, IPC_CHANNELS.FS_EVENT, {
        type: 'unlinkDir',
        path: filePath,
      } as FsEvent, `unlinkDir:${filePath}`);
    });

    watcher.on('error', (error) => {
      logger.error(`Watcher error for ${dirPath}:`, error);
    });

    fsWatchers.set(dirPath, watcher);
    logger.info(`Started watching directory: ${dirPath}`);
  });

  ipcMain.handle(IPC_CHANNELS.FS_UNWATCH_DIR, async (event, dirPath: string) => {
    validateProjectFilePath(dirPath, 'dirPath');
    validateIPCPayload(event, 'fs:unwatchDir', { dirPath });
    const watcher = fsWatchers.get(dirPath);
    if (watcher) {
      await watcher.close();
      fsWatchers.delete(dirPath);
      logger.info(`Stopped watching directory: ${dirPath}`);
    }
  });
}
