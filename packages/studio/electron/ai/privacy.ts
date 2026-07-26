export type PrivacyCategory = 'field-name' | 'credential' | 'token' | 'url-credential' | 'private-key';

export interface PrivacyReport {
  redactedCount: number;
  categories: PrivacyCategory[];
}

export interface Redacted<T> {
  value: T;
  report: PrivacyReport;
}

const SENSITIVE_FIELD = /password|passcode|secret|token|api[_-]?key|credential|authorization|cookie|session|private[_-]?key/i;
const SENSITIVE_NAME = /^(?:password|passwd|passcode|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)s?$/i;
const VALUE_PATTERNS: Array<{ pattern: RegExp; category: PrivacyCategory }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, category: 'token' },
  { pattern: /\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/g, category: 'token' },
  { pattern: /-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, category: 'private-key' },
  { pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/gi, category: 'url-credential' },
  { pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, category: 'credential' },
];

function addCategory(report: PrivacyReport, category: PrivacyCategory): void {
  if (!report.categories.includes(category)) report.categories.push(category);
}

function redactString(value: string, fieldName: string | undefined, report: PrivacyReport): string {
  if (fieldName && SENSITIVE_FIELD.test(fieldName)) {
    report.redactedCount += 1;
    addCategory(report, fieldName.toLowerCase().includes('token') ? 'token' : 'field-name');
    return '[REDACTED]';
  }
  if (fieldName && /^(?:name|key|variable)$/i.test(fieldName) && SENSITIVE_NAME.test(value.trim())) {
    report.redactedCount += 1;
    addCategory(report, 'field-name');
    return '[REDACTED]';
  }

  let redacted = value;
  for (const { pattern, category } of VALUE_PATTERNS) {
    if (pattern.test(redacted)) {
      redacted = redacted.replace(pattern, () => {
        report.redactedCount += 1;
        addCategory(report, category);
        return '[REDACTED]';
      });
      pattern.lastIndex = 0;
    }
  }
  return redacted;
}

function redactUnknown(value: unknown, report: PrivacyReport, fieldName?: string): unknown {
  if (typeof value === 'string') return redactString(value, fieldName, report);
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, report));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const sensitiveObjectName = typeof value === 'object' &&
      typeof (value as { name?: unknown }).name === 'string' &&
      SENSITIVE_NAME.test((value as { name: string }).name);
    return Object.fromEntries(entries.map(([key, child]) => [
      key,
      sensitiveObjectName && key === 'value'
        ? redactString(String(child), 'secret', report)
        : redactUnknown(child, report, key),
    ]));
  }
  return value;
}

export function redactSensitive<T>(value: T): Redacted<T> {
  const report: PrivacyReport = { redactedCount: 0, categories: [] };
  return { value: redactUnknown(value, report) as T, report };
}

export function redactPrompt(prompt: string): Redacted<string> {
  return redactSensitive(prompt);
}

export function isLocalEndpoint(providerId: string, baseUrl?: string): boolean {
  if (!baseUrl) return providerId === 'ollama';
  try {
    const url = new URL(baseUrl);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}
