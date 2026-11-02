/**
 * Community library management IPC handlers (extracted from main.ts,
 * issue #828). Installs/updates verify the PyPI distribution SHA-256
 * against the registry manifest before delegating to the bridge.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../src/types/ipc-contracts';
import { validateIPCPayload } from '../ipc-validator';
import { fetchRegistry, getLibraryFromRegistry } from '../libraries/registry';
import { recordSecurityEvent } from '../audit/securityAudit';
import { createLogger } from '../../src/utils/logger';
import type { IpcContext } from './context';

const logger = createLogger('ipc-libraries');

/**
 * Download package from PyPI and compute SHA-256 hash.
 * Uses Node.js built-in crypto module - no NPM dependencies required.
 *
 * @param pypiPackage The PyPI package name (e.g., 'rpaforge-sap')
 * @param expectedSha256 The expected SHA-256 hash to verify against
 * @returns Promise<void> Resolves if hash matches or verification skipped, rejects on mismatch
 */
export async function verifyPackageHash(pypiPackage: string, expectedSha256?: string): Promise<void> {
  // Skip verification if no hash provided (backward compatibility)
  if (!expectedSha256 || expectedSha256.trim() === '') {
    return;
  }

  // Download from PyPI using fetch
  const pypiUrl = `https://pypi.org/pypi/${encodeURIComponent(pypiPackage)}/json`;
  let response: Response;
  try {
    response = await fetch(pypiUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch package info from PyPI: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    throw new Error(`Failed to fetch package info from PyPI: ${err instanceof Error ? err.message : String(err)}`);
  }

  const data = await response.json();

  // Extract the URL for the main distribution file (wheel or sdist)
  const urls = Array.isArray(data?.urls) ? data.urls : [];
  if (urls.length === 0) {
    throw new Error('No distribution files found for package');
  }

  // Prefer wheel files, fall back to sdist
  const distUrl = urls.find((u: any) => u.url?.endsWith('.whl'))?.url || urls[0].url;

  // Download the actual distribution file
  let distResponse: Response;
  try {
    distResponse = await fetch(distUrl, { signal: AbortSignal.timeout(120000) });
    if (!distResponse.ok) {
      throw new Error(`Failed to download distribution: ${distResponse.status} ${distResponse.statusText}`);
    }
  } catch (err) {
    throw new Error(`Failed to download distribution: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Compute SHA-256 of downloaded content
  const arrayBuffer = await distResponse.arrayBuffer();
  const crypto = (await import('crypto')).default;
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Compare hashes (case-insensitive)
  if (hashHex.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(
      `Checksum mismatch for '${pypiPackage}': expected '${expectedSha256}', got '${hashHex}'. ` +
      'The package may be corrupted or tampered with. Installation blocked.'
    );
  }
}

export function registerLibrariesHandlers(ctx: IpcContext): void {
  // Libraries management
  ipcMain.handle(IPC_CHANNELS.LIBRARIES_LIST_INSTALLED, async (event) => {
    validateIPCPayload(event, 'libraries:listInstalled', {});
    const pythonBridge = ctx.getPythonBridge();
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }
    try {
      const result = await pythonBridge.sendRequest<{ libraries: unknown[] }>('listLibraries', {});
      return result.libraries || [];
    } catch (error) {
      logger.error('Failed to list installed libraries', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_GET_REGISTRY, async (event) => {
    validateIPCPayload(event, 'libraries:getRegistry', {});
    try {
      const registry = await fetchRegistry();
      return registry;
    } catch (error) {
      logger.error('Failed to fetch library registry', error);
      // Return empty registry on error
      return { libraries: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_INSTALL, async (event, pypiPackage: string) => {
    validateIPCPayload(event, 'libraries:install', { pypiPackage });
    const pythonBridge = ctx.getPythonBridge();
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }

    // First, verify SHA-256 hash if available in registry
    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      if (library) {
        await verifyPackageHash(library.pypi_package, library.sha256);
        logger.info(`SHA-256 verification passed for ${pypiPackage}`);
      } else {
        logger.warn(`Package ${pypiPackage} not found in registry, skipping hash verification`);
      }
    } catch (verifyError) {
      logger.error(`SHA-256 verification failed for ${pypiPackage}: ${verifyError}`);
      throw new Error(`Security check failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
    }

    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      const pypiPackageForInstall = library ? library.pypi_package : pypiPackage;
      const sha256ForInstall = library ? library.sha256 : undefined;

      // Pass hash to Python for additional verification
      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('installLibrary', {
        pypiPackage: pypiPackageForInstall,
        sha256: sha256ForInstall,
      });
      if (result.success && pythonBridge.isReady()) {
        await recordSecurityEvent('bridge_restart', { reason: 'update', package: pypiPackageForInstall });
        // Restart bridge to reload entry points after package installation
        try {
          await pythonBridge.restart();
        } catch (restartError) {
          logger.warn(`Failed to restart bridge after install: ${restartError}`);
          // Continue with installation complete even if restart fails
        }
      }
      if (result.success) {
        await recordSecurityEvent('library_install', { package: pypiPackageForInstall, version: library?.version || 'unknown', action: 'install' });
      }
      return { success: result.success, message: result.message || 'Installation complete' };
    } catch (error) {
      logger.error(`Failed to install library ${pypiPackage}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_UPDATE, async (event, pypiPackage: string) => {
    validateIPCPayload(event, 'libraries:update', { pypiPackage });
    const pythonBridge = ctx.getPythonBridge();
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }

    // First, verify SHA-256 hash if available in registry
    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      if (library) {
        await verifyPackageHash(library.pypi_package, library.sha256);
        logger.info(`SHA-256 verification passed for ${pypiPackage} update`);
      } else {
        logger.warn(`Package ${pypiPackage} not found in registry, skipping hash verification`);
      }
    } catch (verifyError) {
      // Hash verification failed - block update
      logger.error(`SHA-256 verification failed for ${pypiPackage}: ${verifyError}`);
      throw new Error(`Security check failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`);
    }

    try {
      const registry = await fetchRegistry();
      const library = getLibraryFromRegistry(registry, pypiPackage);
      const pypiPackageForUpdate = library ? library.pypi_package : pypiPackage;
      const sha256ForUpdate = library ? library.sha256 : undefined;

      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('updateLibrary', {
          pypiPackage: pypiPackageForUpdate,
          sha256: sha256ForUpdate
      });
      if (result.success && pythonBridge.isReady()) {
        await recordSecurityEvent('bridge_restart', { reason: 'update', package: pypiPackage });
        try {
          await pythonBridge.restart();
        } catch (restartError) {
          logger.warn(`Failed to restart bridge after update: ${restartError}`);
        }
      }
      return { success: result.success, message: result.message || 'Update complete' };
    } catch (error) {
      logger.error(`Failed to update library ${pypiPackage}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_UNINSTALL, async (event, pypiPackage: string) => {
    validateIPCPayload(event, 'libraries:uninstall', { pypiPackage });
    const pythonBridge = ctx.getPythonBridge();
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }
    try {
      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('uninstallLibrary', { pypiPackage });
      if (result.success && pythonBridge.isReady()) {
        // Restart bridge to reload entry points after package removal
        try {
          await pythonBridge.restart();
        } catch (restartError) {
          logger.warn(`Failed to restart bridge after uninstall: ${restartError}`);
          // Continue with uninstall complete even if restart fails
        }
      }
      if (result.success) {
        await recordSecurityEvent('library_uninstall', { package: pypiPackage, action: 'uninstall' });
      }
      return { success: result.success, message: result.message || 'Uninstall complete' };
    } catch (error) {
      logger.error(`Failed to uninstall library ${pypiPackage}`, error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LIBRARIES_REFRESH, async (event) => {
    validateIPCPayload(event, 'libraries:refresh', {});
    const pythonBridge = ctx.getPythonBridge();
    if (!pythonBridge) {
      throw new Error('Python bridge not initialized');
    }
    try {
      const result = await pythonBridge.sendRequest<{ success: boolean; message?: string }>('refreshLibraries', {});
      return { success: result.success, message: result.message || 'Libraries refreshed' };
    } catch (error) {
      logger.error('Failed to refresh libraries', error);
      throw error;
    }
  });
}
