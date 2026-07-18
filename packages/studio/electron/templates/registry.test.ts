import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

let homePath = '';
vi.mock('electron', () => ({ app: { getPath: () => homePath } }));

import { fetchTemplateRegistry } from './registry';

const template = {
  metadata: { id: 'community-web', name: 'Community Web', type: 'project' },
  mainProcess: { nodes: [{ id: 'start' }], edges: [] },
};

describe('template registry', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    if (homePath) await rm(homePath, { recursive: true, force: true });
    homePath = '';
  });

  it('uses remote templates and persists a cache', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-template-registry-'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ templates: [template] }) }));

    await expect(fetchTemplateRegistry()).resolves.toMatchObject({ source: 'remote', templates: [template] });
    await expect(readFile(join(homePath, 'templates', 'registry.json'), 'utf8')).resolves.toContain('community-web');
  });

  it('falls back to a cached registry when remote fetch fails', async () => {
    homePath = await mkdtemp(join(tmpdir(), 'rpaforge-template-registry-'));
    await mkdir(join(homePath, 'templates'), { recursive: true });
    await writeFile(join(homePath, 'templates', 'registry.json'), JSON.stringify({ templates: [template] }), 'utf8');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(fetchTemplateRegistry()).resolves.toMatchObject({ source: 'cache', templates: [template] });
  });
});
