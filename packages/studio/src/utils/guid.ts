/**
 * GUID generation utilities for stable node identification.
 *
 * Uses crypto.randomUUID() for cryptographically strong GUIDs.
 * Falls back to a polyfill for environments without crypto API.
 */

/**
 * Generate a GUID (UUID v4 format).
 * Uses native crypto.randomUUID() when available.
 */
export function generateGuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a node ID with GUID for stable identification.
 * Format: "node_{guid}"
 */
export function generateNodeId(): string {
  return `node_${generateGuid()}`;
}
