import { describe, expect, test } from 'vitest';

const localeModules = import.meta.glob<Record<string, unknown>>(
  '../../public/locales/**/*.json',
  { eager: true, import: 'default' }
);

function parseLocalePath(path: string): { lang: string; namespace: string } | null {
  const match = path.match(/locales\/(\w+)\/(\w+)\.json$/);
  if (!match) return null;
  return { lang: match[1], namespace: match[2] };
}

function getAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
    }
  }
  return keys;
}

interface NamespaceGroup {
  namespace: string;
  locales: Record<string, Record<string, unknown>>;
}

describe('locale completeness', () => {
  const groups = new Map<string, NamespaceGroup>();
  
  for (const [path, data] of Object.entries(localeModules)) {
    const parsed = parseLocalePath(path);
    if (!parsed) continue;
    
    if (!groups.has(parsed.namespace)) {
      groups.set(parsed.namespace, { namespace: parsed.namespace, locales: {} });
    }
    groups.get(parsed.namespace)!.locales[parsed.lang] = data as Record<string, unknown>;
  }

  const SUPPORTED_LANGUAGES = ['en', 'ru', 'de', 'es', 'zh'];
  const CORE_NAMESPACES = ['common', 'errors'];

  test.each(CORE_NAMESPACES)('all languages have same keys as English in %s namespace', (namespace) => {
    const group = groups.get(namespace);
    if (!group) {
      return;
    }
    
    const enKeys = getAllKeys(group.locales['en'] || {});
    
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === 'en') continue;
      
      const langData = group.locales[lang];
      if (!langData) {
        console.warn(`Missing locale file for ${lang}/${namespace}.json`);
        continue;
      }
      
      const langKeys = getAllKeys(langData);
      const missingKeys = enKeys.filter(k => !langKeys.includes(k));
      const extraKeys = langKeys.filter(k => !enKeys.includes(k));
      
      expect(
        missingKeys,
        `${lang}/${namespace}.json is missing ${missingKeys.length} keys: ${missingKeys.join(', ')}`
      ).toEqual([]);
      
      if (extraKeys.length > 0) {
        console.info(`${lang}/${namespace}.json has ${extraKeys.length} extra keys not in English: ${extraKeys.join(', ')}`);
      }
    }
  });

  test('all 5 languages exist for common.json', () => {
    const common = groups.get('common');
    expect(common).toBeDefined();
    
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(common!.locales).toHaveProperty(lang);
    }
  });

  test('key count is within 5% of English baseline', () => {
    const common = groups.get('common');
    if (!common) return;
    
    const enCount = getAllKeys(common.locales['en'] || {}).length;
    const threshold = 0.05;
    
    for (const lang of SUPPORTED_LANGUAGES) {
      if (lang === 'en') continue;
      const langData = common.locales[lang];
      if (!langData) continue;
      
      const count = getAllKeys(langData).length;
      const diff = Math.abs(count - enCount) / enCount;
      
      expect(
        diff <= threshold,
        `${lang}/common.json has ${count} keys (${(diff * 100).toFixed(1)}% difference from English ${enCount}, threshold ${threshold * 100}%)`
      ).toBe(true);
    }
  });
});
