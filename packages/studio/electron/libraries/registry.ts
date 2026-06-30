/**
 * Library registry management for community libraries.
 *
 * Fetches curated list of available RPA libraries from a remote registry.
 * Validates manifest integrity using SHA-256 hashing.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { RegistryManifest, CommunityLibrary } from '../../src/types/ipc-contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Registry remote URL — points to the latest published registry.json in GitHub Releases.
// CI updates this on each release.
const REGISTRY_URL = 'https://github.com/chelslava/rpaforge/releases/latest/download/registry.json';

// Path to bundled registry.json shipped with the app (fallback).
const BUNDLED_REGISTRY_PATH = path.join(__dirname, 'registry.json');

/**
 * Calculate SHA-256 hash of JSON content.
 *
 * @param content The registry manifest as JSON string
 * @returns The SHA-256 hash as hex string
 */
export function calculateRegistrySha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Verify registry manifest integrity.
 *
 * @param manifest The registry manifest object
 * @param expectedSha256 The expected SHA-256 hash (optional)
 * @returns true if manifest is valid, false otherwise
 */
export function verifyRegistryIntegrity(
  manifest: RegistryManifest,
  expectedSha256?: string
): boolean {
  // Basic structure validation
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.libraries)) {
    return false;
  }

  // Validate each library entry
  for (const lib of manifest.libraries) {
    if (!lib.name || !lib.pypi_package || !lib.version) {
      return false;
    }
    // Package name validation: alphanumeric, hyphens, underscores
    if (!/^[a-z0-9_-]+$/i.test(lib.pypi_package)) {
      return false;
    }
  }

  // SHA-256 verification if expected hash provided
  if (expectedSha256) {
    const content = JSON.stringify(manifest);
    const actualSha256 = calculateRegistrySha256(content);
    return actualSha256 === expectedSha256.toLowerCase();
  }

  return true;
}

/**
 * Fetch library registry from remote source.
 *
 * Tries:
 * 1. Remote URL (GitHub Releases) — cached registry.json published with each release
 * 2. Bundled registry.json — shipped with the app as fallback
 * 3. Empty manifest — graceful degradation
 *
 * @returns Promise<RegistryManifest> The registry manifest
 */
export async function fetchRegistry(): Promise<RegistryManifest> {
  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const manifest: RegistryManifest = await response.json();
      if (verifyRegistryIntegrity(manifest)) {
        return manifest;
      }
      console.warn('Remote registry failed integrity check, trying bundled');
    }
  } catch (err) {
    console.warn('Failed to fetch remote registry:', err);
  }

  try {
    const bundledRaw = await fs.readFile(BUNDLED_REGISTRY_PATH, 'utf-8');
    const manifest: RegistryManifest = JSON.parse(bundledRaw);
    if (verifyRegistryIntegrity(manifest)) {
      return manifest;
    }
    console.warn('Bundled registry failed integrity check, using default');
  } catch (err) {
    console.warn('Failed to read bundled registry:', err);
  }

  return { libraries: [] };
}

/**
 * Validate a library from the registry is safe to install.
 *
 * @param library The community library to validate
 * @returns boolean True if library is safe to install
 */
export function validateLibrary(library: CommunityLibrary): boolean {
  // Validate that library has required fields
  if (!library.name || !library.pypi_package || !library.version) {
    return false;
  }

  // Validate package name is reasonable
  if (!/^[a-z0-9_-]+$/.test(library.pypi_package)) {
    return false;
  }

  return true;
}

/**
 * Get a library from registry by package name.
 *
 * @param registry The registry manifest
 * @param pypiPackage The PyPI package name to find
 * @returns CommunityLibrary | null The library if found, null otherwise
 */
export function getLibraryFromRegistry(
  registry: RegistryManifest,
  pypiPackage: string
): CommunityLibrary | null {
  return (
    registry.libraries.find((lib: CommunityLibrary) => lib.pypi_package === pypiPackage) || null
  );
}
