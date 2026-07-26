import { app } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export const AI_CONSENT_VERSION = '2026-07-19.v1';
export type AiConsentFeature = 'diagram' | 'compare' | 'suggestions' | 'auto-fill';

type ConsentFile = Partial<Record<AiConsentFeature, string>>;

function getConsentPath(): string {
  return path.join(app.getPath('userData'), 'ai-consent.json');
}

function readConsent(): ConsentFile {
  try {
    if (!fs.existsSync(getConsentPath())) return {};
    const value: unknown = JSON.parse(fs.readFileSync(getConsentPath(), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as ConsentFile : {};
  } catch {
    return {};
  }
}

export function hasAiConsent(feature: AiConsentFeature): boolean {
  return readConsent()[feature] === AI_CONSENT_VERSION;
}

export async function grantAiConsent(feature: AiConsentFeature): Promise<void> {
  const store = readConsent();
  store[feature] = AI_CONSENT_VERSION;
  const consentPath = getConsentPath();
  const temporaryPath = `${consentPath}.${process.pid}.tmp`;
  await fsp.mkdir(path.dirname(consentPath), { recursive: true });
  await fsp.writeFile(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
  await fsp.rename(temporaryPath, consentPath);
}

export function revokeAiConsent(feature: AiConsentFeature): void {
  const store = readConsent();
  delete store[feature];
  try {
    fs.writeFileSync(getConsentPath(), JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // Consent revocation is best-effort; a future version mismatch also invalidates it.
  }
}
