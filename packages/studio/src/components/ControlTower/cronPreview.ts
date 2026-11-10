/**
 * Human-readable cron preview for the schedules tab (issue #858).
 *
 * The canonical semantics live in the runner's cron.py (issue #818); this is
 * a display-only summary covering the common shapes — the raw expression is
 * always shown alongside, so a wrong guess can never hide the truth.
 */

export type CronLanguage = string;

interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export function parseCronFields(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

const isWildcard = (field: string): boolean => field === '*' || field === '?';

/**
 * Build an i18n key + params describing the schedule. The key resolves
 * through `orchestrator.cron.<key>`; unknown shapes fall back to `raw`.
 */
export function describeCron(
  expression: string,
): { key: string; params?: Record<string, string | number> } {
  const fields = parseCronFields(expression);
  if (!fields) {
    return { key: 'raw' };
  }
  const { minute, hour, dayOfMonth, month, dayOfWeek } = fields;

  // Every N minutes: */N
  const stepMinute = minute.match(/^\*\/(\d+)$/);
  if (stepMinute && isWildcard(hour) && isWildcard(dayOfMonth) && isWildcard(month) && isWildcard(dayOfWeek)) {
    return { key: 'everyMinutes', params: { n: Number(stepMinute[1]) } };
  }
  // Hourly at minute M: M *
  if (/^\d+$/.test(minute) && hour === '*' && isWildcard(dayOfMonth) && isWildcard(month) && isWildcard(dayOfWeek)) {
    return { key: 'hourly', params: { minute: Number(minute) } };
  }
  // Daily-ish at HH:MM
  const hourRange = hour.match(/^(\d+)-(\d+)$/);
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && isWildcard(month)) {
    const h = Number(hour);
    const m = Number(minute);
    if (isWildcard(dayOfMonth) && isWildcard(dayOfWeek)) {
      return { key: 'everyDay', params: { h, m } };
    }
    if (dayOfMonth === '*' && dayOfWeek === '1-5') {
      return { key: 'weekdays', params: { h, m } };
    }
    if (isWildcard(dayOfWeek) && dayOfMonth === '1') {
      return { key: 'monthly', params: { h, m } };
    }
  }
  if (hourRange && minute === '0' && isWildcard(dayOfMonth) && isWildcard(month)) {
    if (dayOfWeek === '1-5') {
      return { key: 'hourRangeWeekdays', params: { from: Number(hourRange[1]), to: Number(hourRange[2]) } };
    }
  }
  return { key: 'raw' };
}
