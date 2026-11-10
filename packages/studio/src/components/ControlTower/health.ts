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
