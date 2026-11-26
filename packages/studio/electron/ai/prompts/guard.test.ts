// @vitest-environment node

/**
 * Guard: zero inline prompt constants in the Studio AI modules (issue
 * #904). Every LLM prompt template must live in the versioned registry
 * (electron/ai/prompts/templates/*.json). This test scans the AI sources
 * for the two shapes an inline prompt takes — a module-level PROMPT
 * constant and a system-prompt "You …" opener inside a string/template
 * literal — and fails when one reappears.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const AI_DIR = join(__dirname, '..');

const PROMPT_CONSTANT_RE = /\bconst\s+[A-Z][A-Z0-9_]*PROMPT[A-Z0-9_]*\s*=/;
const PROMPT_OPENER_RE =
  /['"`]You (?:are an? |diagnose |route |extract |locate |transcribe )/;

function tsSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'prompts') continue; // registry + templates own the prompts
      out.push(...tsSources(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('prompt guard', () => {
  it('scans the expected AI modules', () => {
    const files = tsSources(AI_DIR).map((file) => file.split(/[\\/]/).pop());
    for (const expected of [
      'generateDiagram.ts',
      'suggestions.ts',
      'paramFill.ts',
      'diagnoseFailure.ts',
      'assistant.ts',
    ]) {
      expect(files).toContain(expected);
    }
  });

  it('has no inline prompt constants', () => {
    const offenders: string[] = [];
    for (const file of tsSources(AI_DIR)) {
      const source = readFileSync(file, 'utf8');
      if (PROMPT_CONSTANT_RE.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `Inline PROMPT constants found in ${offenders.join(', ')}; move them into ` +
        'electron/ai/prompts/templates/ and render via renderPrompt().'
    ).toEqual([]);
  });

  it('has no inline system-prompt openers', () => {
    const offenders: string[] = [];
    for (const file of tsSources(AI_DIR)) {
      const source = readFileSync(file, 'utf8');
      if (PROMPT_OPENER_RE.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `Inline system-prompt openers found in ${offenders.join(', ')}; move them into ` +
        'electron/ai/prompts/templates/.'
    ).toEqual([]);
  });
});
