import { describe, expect, test } from 'vitest';
import { buildIssueReportUrl } from './ConsoleOutput';

describe('buildIssueReportUrl', () => {
  const TS = new Date('2024-01-01T00:00:00.000Z');

  test('produces a valid GitHub new-issue URL', () => {
    const url = buildIssueReportUrl('Something broke', undefined, TS);
    expect(url).toMatch(/^https:\/\/github\.com\/chelslava\/rpaforge\/issues\/new\?title=.+&body=.+/);
  });

  test('strips ASCII control characters from the title', () => {
    const url = buildIssueReportUrl('Error\x01\x1F\x7F happened', undefined, TS);
    const title = decodeURIComponent(url.split('?title=')[1].split('&body=')[0]);
    expect(title).not.toMatch(/[\x00-\x1F\x7F]/);
    expect(title).toBe('Error: Error happened');
  });

  test('strips Unicode bidirectional override characters from the title', () => {
    const rtl = '‮'; // RIGHT-TO-LEFT OVERRIDE
    const url = buildIssueReportUrl(`Error${rtl}real`, undefined, TS);
    const title = decodeURIComponent(url.split('?title=')[1].split('&body=')[0]);
    expect(title).not.toContain(rtl);
    expect(title).toBe('Error: Errorreal');
  });

  test('truncates the sanitized message to 50 chars in the title', () => {
    const long = 'A'.repeat(100);
    const url = buildIssueReportUrl(long, undefined, TS);
    const title = decodeURIComponent(url.split('?title=')[1].split('&body=')[0]);
    // "Error: " (7) + 50 chars = 57
    expect(title).toBe(`Error: ${'A'.repeat(50)}`);
  });

  test('includes raw message verbatim in the body', () => {
    const msg = 'ValueError: bad\x01value';
    const url = buildIssueReportUrl(msg, undefined, TS);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain(msg);
  });

  test('includes activity and library details in the body', () => {
    const url = buildIssueReportUrl('oops', { activityName: 'MyActivity', library: 'mylib' }, TS);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Activity: MyActivity');
    expect(body).toContain('Library: mylib');
  });

  test('falls back to N/A when details are absent', () => {
    const url = buildIssueReportUrl('oops', undefined, TS);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toContain('Activity: N/A');
    expect(body).toContain('Library: N/A');
  });
});
