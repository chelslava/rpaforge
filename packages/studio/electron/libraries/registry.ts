/**
 * Library registry management for community libraries.
 *
 * Fetches curated list of available RPA libraries from a remote registry.
 */

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
 * Fetch library registry from remote source.
 *
 * Currently returns a default registry. In production, this should:
 * 1. Fetch from a pinned GitHub Releases asset or CDN
 * 2. Verify SHA-256 hash
 * 3. Cache locally with TTL
 *
 * @returns Promise<RegistryManifest> The registry manifest
 */
export async function fetchRegistry(): Promise<RegistryManifest> {
  // TODO: Implement remote registry fetching
  // For now, return the default registry
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
