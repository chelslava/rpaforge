import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

let homePath = '';
vi.mock('electron', () => ({ app: { getPath: () => homePath } }));

import { AI_CONSENT_VERSION, grantAiConsent, hasAiConsent, revokeAiConsent } from './consentStore';

describe('AI consent store', () => {
  afterEach(async () => {
    if (homePath) await rm(homePath, { recursive: true, force: true });
    homePath = '';
  });

  it('persists versioned per-feature consent', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-ai-consent-'));
    expect(hasAiConsent('diagram')).toBe(false);

    await grantAiConsent('diagram');

    expect(hasAiConsent('diagram')).toBe(true);
    expect(hasAiConsent('compare')).toBe(false);
    await expect(readFile(join(homePath, 'ai-consent.json'), 'utf8')).resolves.toContain(AI_CONSENT_VERSION);
  });

  it('revokes consent and invalidates stale versions', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-ai-consent-'));
    await grantAiConsent('suggestions');
    revokeAiConsent('suggestions');
    expect(hasAiConsent('suggestions')).toBe(false);
  });
});
