/**
 * Community library auto-update sync (extracted from main.ts, issue #828).
 *
 * Compares installed dist versions against the registry manifest:
 * - installed + outdated: auto-update when RPAFORGE_LIBRARIES_AUTOUPDATE=1
 * - anything actionable: notify renderer via a synthetic bridge event
 */

import { IPC_CHANNELS } from '../src/types/ipc-contracts';
import { createLogger } from '../src/utils/logger';
import { getMainWindow } from './windows';
import { getPythonBridge } from './bridgeLauncher';
import { fetchRegistry } from './libraries/registry';

const logger = createLogger('electron-library-sync');

export async function syncLibraryUpdates(): Promise<void> {
  const pythonBridge = getPythonBridge();
  const mainWindow = getMainWindow();
  if (!pythonBridge?.isReady() || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    const manifest = await fetchRegistry();
    const expected: Record<string, string> = {};
    for (const lib of manifest.libraries) {
      if (lib.pypi_package && lib.version) expected[lib.pypi_package] = lib.version;
    }
    if (Object.keys(expected).length === 0) return;

    const result = await pythonBridge.sendRequest<{
      updates: Record<string, { installed: string | null; latest: string; update_available: boolean; not_installed: boolean }>;
    }>('checkLibraryUpdates', { expected });

    const autoUpdate = process.env.RPAFORGE_LIBRARIES_AUTOUPDATE === '1';
    const updated: string[] = [];
    const pending: string[] = [];
    for (const [name, status] of Object.entries(result.updates)) {
      if (status.not_installed) {
        pending.push(name);
        continue;
      }
      if (!status.update_available) continue;
      if (autoUpdate) {
        try {
          await pythonBridge.sendRequest('updateLibrary', { pypiPackage: name });
          updated.push(name);
        } catch (err) {
          logger.warn(`Auto-update failed for ${name}`, err);
          pending.push(name);
        }
      } else {
        pending.push(name);
      }
    }

    if ((updated.length || pending.length) && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.BRIDGE_EVENT, {
        type: 'libraries_updates',
        updated,
        pending,
      });
    }
    if (updated.length) logger.info(`Auto-updated libraries: ${updated.join(', ')}`);
  } catch (err) {
    logger.warn('Library update sync failed', err);
  }
}
