import { app } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ProjectTemplate } from '../../src/types/template';

export interface TemplateRegistryManifest {
  templates: ProjectTemplate[];
  fetchedAt?: string;
  source: 'remote' | 'cache' | 'bundled';
}

const REGISTRY_URL = process.env.RPAFORGE_TEMPLATE_REGISTRY_URL ??
  'https://github.com/chelslava/rpaforge/releases/latest/download/templates.json';

function cachePath(): string {
  return path.join(app.getPath('userData'), 'templates', 'registry.json');
}

function isTemplate(value: unknown): value is ProjectTemplate {
  if (!value || typeof value !== 'object') return false;
  const template = value as Partial<ProjectTemplate>;
  return Boolean(template.metadata?.id && template.metadata?.name && template.metadata?.type === 'project' && template.mainProcess);
}

function parseManifest(value: unknown): ProjectTemplate[] | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { templates?: unknown }).templates)) {
    return null;
  }
  const templates = (value as { templates: unknown[] }).templates.filter(isTemplate);
  return templates.length > 0 ? templates : null;
}

async function readCache(): Promise<ProjectTemplate[] | null> {
  try {
    return parseManifest(JSON.parse(await fs.readFile(cachePath(), 'utf8')));
  } catch {
    return null;
  }
}

export async function fetchTemplateRegistry(): Promise<TemplateRegistryManifest> {
  try {
    const response = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const templates = parseManifest(await response.json());
      if (templates) {
        await fs.mkdir(path.dirname(cachePath()), { recursive: true });
        await fs.writeFile(cachePath(), JSON.stringify({ templates }), 'utf8');
        return { templates, fetchedAt: new Date().toISOString(), source: 'remote' };
      }
    }
  } catch {
    // Offline mode falls through to the last known-good cache.
  }

  const cached = await readCache();
  return { templates: cached ?? [], source: cached ? 'cache' : 'bundled' };
}
