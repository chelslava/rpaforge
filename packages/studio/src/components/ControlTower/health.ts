import type { ConnectionHealth } from '../../stores/orchestratorStore';

/** Tailwind classes for the connection-health badge across the panel. */
export function healthBadgeClass(health: ConnectionHealth | undefined): string {
  switch (health) {
    case 'healthy':
      return 'bg-green-600/20 text-green-500';
    case 'unreachable':
      return 'bg-red-600/20 text-red-500';
    case 'auth-error':
      return 'bg-amber-600/20 text-amber-500';
    case 'unsupported':
      return 'bg-gray-600/20 text-gray-400';
    default:
      return 'bg-gray-600/20 text-gray-400';
  }
}

/** Queue lifecycle statuses shown as counters across the panel (issue #858). */
export const QUEUE_STATUS_KEYS = [
  'New',
  'InProgress',
  'Retried',
  'Successful',
  'Failed',
  'DeadLetter',
] as const;

/** Compact uptime rendering for the host summary (issue #880). */
export function formatUptime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
