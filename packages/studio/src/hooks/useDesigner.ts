import { useCallback, useEffect, useMemo, useState } from 'react';
import { createActivityBlockData } from '../types/blocks';
import type { Activity } from '../types/engine';
import { normalizeActivitiesResult } from '../types/engine';
import { useProcessStore } from '../stores/processStore';
import { useEngine } from './useEngine';
import { generateNodeId } from '../utils/guid';
import { createLogger } from '../utils/logger';

const logger = createLogger('useDesigner');

export interface ActivityCategory {
  name: string;
  items: Activity[];
}

export interface UseDesignerResult {
  categories: ActivityCategory[];
  selectedNode: {
    id: string;
    position: { x: number; y: number };
    data: unknown;
  } | null;
  isSelectionEmpty: boolean;
  undoAvailable: boolean;
  redoAvailable: boolean;
  isLoading: boolean;

  selectNode: (id: string | null) => void;
  deselectNode: () => void;

  undo: () => void;
  redo: () => void;

  addActivity: (activity: Activity & { position: { x: number; y: number } }) => void;
  updateActivity: (
    id: string,
    data: Partial<Pick<Activity, 'name' | 'category' | 'description'>>
  ) => void;
  deleteActivity: (id: string) => void;

  refreshActivities: () => Promise<void>;
}

function groupActivitiesByCategory(activities: Activity[]): ActivityCategory[] {
  const categoryMap = new Map<string, Activity[]>();

  for (const activity of activities) {
    const category = activity.category || 'Other';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)?.push(activity);
  }

  return Array.from(categoryMap.entries())
    .map(([name, items]) => ({
      name,
      items: items.slice().sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export const useDesigner = (): UseDesignerResult => {
  const processStore = useProcessStore();
  const { getActivities } = useEngine();
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshActivities = useCallback(async () => {
    setIsLoading(true);

    try {
      const result = normalizeActivitiesResult(await getActivities());
      setCategories(groupActivitiesByCategory(result.activities));
    } catch (err) {
      logger.error('Failed to fetch activities', err);
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, [getActivities]);

  useEffect(() => {
    void refreshActivities();
  }, [refreshActivities]);

  const selectedNode = useMemo(() => {
    if (!processStore.selectedNodeId) {
      return null;
    }

    const node = processStore.nodes.find((candidate) => candidate.id === processStore.selectedNodeId);
    if (!node) {
      return null;
    }

    return {
      id: node.id,
      position: node.position,
      data: node.data,
    };
  }, [processStore.nodes, processStore.selectedNodeId]);

  const isSelectionEmpty = !processStore.selectedNodeId;

  const undoAvailable = processStore.undoStack.length > 0;
  const redoAvailable = processStore.redoStack.length > 0;

  const selectNode = useCallback(
    (id: string | null) => {
      processStore.setSelectedNode(id);
    },
    [processStore]
  );

  const deselectNode = useCallback(() => {
    processStore.setSelectedNode(null);
  }, [processStore]);

  const undo = useCallback(() => {
    processStore.undo();
  }, [processStore]);

  const redo = useCallback(() => {
    processStore.redo();
  }, [processStore]);

  const addActivity = useCallback(
    (activity: Activity & { position: { x: number; y: number } }) => {
      const nodeId = generateNodeId();
      const blockData = createActivityBlockData(activity, nodeId);

      const added = processStore.addNode({
        id: nodeId,
        type: 'activity',
        position: activity.position,
        data: {
          activity,
          blockData,
          activityValues: { ...blockData.params },
          builtinSettings: {
            timeout: blockData.builtin.timeout_ms > 0 ? blockData.builtin.timeout_ms / 1000 : undefined,
            retryEnabled: blockData.builtin.has_retry ? false : undefined,
            retryCount: blockData.builtin.has_retry ? 3 : undefined,
            retryInterval: blockData.builtin.has_retry ? '2s' : undefined,
            continueOnError: blockData.builtin.has_continue_on_error ? false : undefined,
          },
          description: activity.description,
          tags: [],
        },
      });

      if (added) {
        selectNode(nodeId);
      }
    },
    [processStore, selectNode]
  );

  const updateActivity = useCallback(
    (id: string, data: Partial<Pick<Activity, 'name' | 'category' | 'description'>>) => {
      const currentNode = processStore.nodes.find((node) => node.id === id);
      const currentActivity = currentNode?.data.activity;

      if (!currentActivity) {
        return;
      }

      const nextActivity = {
        ...currentActivity,
        ...data,
      };

      processStore.updateNode(id, {
        activity: nextActivity,
        description: data.description ?? currentNode?.data.description,
        blockData: currentNode?.data.blockData?.type === 'activity'
          ? {
              ...currentNode.data.blockData,
              name: data.name ?? currentNode.data.blockData.name,
              label: data.name ?? currentNode.data.blockData.label,
              category: data.category ?? currentNode.data.blockData.category,
              description: data.description ?? currentNode.data.blockData.description,
            }
          : currentNode?.data.blockData,
      });
    },
    [processStore]
  );

  const deleteActivity = useCallback(
    (id: string) => {
      processStore.removeNode(id);
    },
    [processStore]
  );

  return {
    categories,
    selectedNode,
    isSelectionEmpty,
    undoAvailable,
    redoAvailable,
    isLoading,
    selectNode,
    deselectNode,
    undo,
    redo,
    addActivity,
    updateActivity,
    deleteActivity,
    refreshActivities,
  };
};

export default useDesigner;
