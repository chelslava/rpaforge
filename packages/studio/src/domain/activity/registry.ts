import type { Activity, ActivityBridgePayload } from '../../types/engine';
import { normalizeActivity } from '../../types/engine';

export interface ActivityRegistry {
  activities: Map<string, Activity>;
  byCategory: Map<string, Set<string>>;
  byLibrary: Map<string, Set<string>>;
}

export function createActivityRegistry(): ActivityRegistry {
  return {
    activities: new Map(),
    byCategory: new Map(),
    byLibrary: new Map(),
  };
}

export function registerActivity(
  registry: ActivityRegistry,
  activity: Activity
): void {
  registry.activities.set(activity.id, activity);

  if (!registry.byCategory.has(activity.category)) {
    registry.byCategory.set(activity.category, new Set());
  }
  registry.byCategory.get(activity.category)!.add(activity.id);

  const library = activity.library;
  if (!registry.byLibrary.has(library)) {
    registry.byLibrary.set(library, new Set());
  }
  registry.byLibrary.get(library)!.add(activity.id);
}

export function getActivity(
  registry: ActivityRegistry,
  id: string
): Activity | undefined {
  return registry.activities.get(id);
}

export function getActivitiesByCategory(
  registry: ActivityRegistry,
  category: string
): Activity[] {
  const ids = registry.byCategory.get(category);
  if (!ids) return [];
  return [...ids]
    .map((id) => registry.activities.get(id))
    .filter((a): a is Activity => a !== undefined);
}

export function getActivitiesByLibrary(
  registry: ActivityRegistry,
  library: string
): Activity[] {
  const ids = registry.byLibrary.get(library);
  if (!ids) return [];
  return [...ids]
    .map((id) => registry.activities.get(id))
    .filter((a): a is Activity => a !== undefined);
}

export function getAllActivities(registry: ActivityRegistry): Activity[] {
  return [...registry.activities.values()];
}

export function loadActivitiesFromBridge(
  registry: ActivityRegistry,
  payloads: ActivityBridgePayload[]
): void {
  for (const payload of payloads) {
    const activity = normalizeActivity(payload);
    registerActivity(registry, activity);
  }
}
