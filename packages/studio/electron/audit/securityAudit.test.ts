import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSecurityEvents, recordSecurityEvent } from './securityAudit';

describe('security audit log', () => {
  let homePath: string;

  afterEach(async () => {
    if (homePath) await rm(homePath, { recursive: true, force: true });
  });

  it('writes JSONL events with sensitive values redacted and reads newest first', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-security-audit-'));

    await recordSecurityEvent('ai_provider_key_change', {
      provider: 'openai-compatible',
      apiKey: 'must-not-be-written',
    }, homePath);
    await recordSecurityEvent('git_remote_change', { remote: 'origin', urlChanged: true }, homePath);

    const file = await readFile(join(homePath, '.rpaforge', 'security-audit.log'), 'utf8');
    expect(file).not.toContain('must-not-be-written');
    expect((await readSecurityEvents(homePath)).map((event) => event.eventType)).toEqual([
      'git_remote_change',
      'ai_provider_key_change',
    ]);
  });
});
