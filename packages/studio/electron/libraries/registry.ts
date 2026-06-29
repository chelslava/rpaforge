/**
 * Library registry management for community libraries.
 *
 * Fetches curated list of available RPA libraries from a remote registry.
 * Validates manifest integrity using SHA-256 hashing.
 */

import crypto from 'crypto';
import type { RegistryManifest, CommunityLibrary } from '../../src/types/ipc-contracts';

// Default empty registry - in production, this would be fetched from GitHub Releases or a CDN
const DEFAULT_REGISTRY: RegistryManifest = {
  libraries: [
    {
      name: 'rpaforge-sap',
      display_name: 'SAP GUI Automation',
      description: 'Automate SAP GUI applications via the SAP scripting API',
      author: 'community',
      pypi_package: 'rpaforge-sap',
      version: '1.0.0',
      tags: ['sap', 'enterprise', 'desktop'],
    },
    {
      name: 'rpaforge-salesforce',
      display_name: 'Salesforce Integration',
      description: 'Connect and automate Salesforce CRM operations',
      author: 'community',
      pypi_package: 'rpaforge-salesforce',
      version: '1.0.0',
      tags: ['salesforce', 'crm', 'cloud'],
    },
  ],
};

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
 * Currently returns a default registry. In production, this should:
 * 1. Fetch from a pinned GitHub Releases asset or CDN
 * 2. Verify SHA-256 hash via accompanying .sha256 file
 * 3. Cache locally with TTL
 *
 * @returns Promise<RegistryManifest> The registry manifest
 */
export async function fetchRegistry(): Promise<RegistryManifest> {
  // TODO: Implement remote registry fetching from GitHub Releases
  // Example production implementation:
  // const response = await fetch('https://github.com/rpaforge/library-registry/releases/download/latest/registry.json');
  // const shaResponse = await fetch('https://github.com/rpaforge/library-registry/releases/download/latest/registry.json.sha256');
  // const manifest = await response.json();
  // const expectedSha256 = (await shaResponse.text()).split(' ')[0];
  // if (!verifyRegistryIntegrity(manifest, expectedSha256)) {
  //   throw new Error('Registry manifest integrity check failed');
  // }
  // return manifest;

  // For now, return the default registry with integrity check
  if (!verifyRegistryIntegrity(DEFAULT_REGISTRY)) {
    throw new Error('Default registry manifest validation failed');
  }
  return DEFAULT_REGISTRY;
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
