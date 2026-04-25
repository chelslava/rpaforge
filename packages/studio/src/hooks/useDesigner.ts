import { useCallback, useEffect, useMemo, useState } from 'react';
import { createActivityBlockData } from '../types/blocks';
import type { Activity } from '../types/engine';
import { normalizeActivitiesResult } from '../types/engine';
import { useBlockStore, type ProcessNode } from '../stores/blockStore';
import { useHistoryStore } from '../stores/historyStore';
import { useSelectionStore } from '../stores/selectionStore';
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
  const nodes = useBlockStore((s) => s.nodes);
  const addNode = useBlockStore((s) => s.addNode);
  const removeNode = useBlockStore((s) => s.removeNode);
  const updateNode = useBlockStore((s) => s.updateNode);
  const setNodes = useBlockStore((s) => s.setNodes);
  const setEdges = useBlockStore((s) => s.setEdges);

  const selectedNodeId = useSelectionStore((s) => s.selectedNodeId);
  const setSelectedNode = useSelectionStore((s) => s.setSelectedNode);

  const undoStack = useHistoryStore((s) => s.undoStack);
  const redoStack = useHistoryStore((s) => s.redoStack);
  const performUndo = useHistoryStore((s) => s.undo);
  const performRedo = useHistoryStore((s) => s.redo);

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
    refreshActivities();
  }, [refreshActivities]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }

    const node = nodes.find((candidate) => candidate.id === selectedNodeId);
    if (!node) {
      return null;
    }

    return {
      id: node.id,
      position: node.position,
      data: node.data,
    };
  }, [nodes, selectedNodeId]);

  const isSelectionEmpty = !selectedNodeId;

  const undoAvailable = undoStack.length > 0;
  const redoAvailable = redoStack.length > 0;

  const selectNode = useCallback(
    (id: string | null) => {
      setSelectedNode(id);
    },
    [setSelectedNode]
  );

  const deselectNode = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const undo = useCallback(() => {
    const result = performUndo(nodes, []);
    if (result) {
      setNodes(result.nodes as ProcessNode[]);
      setEdges(result.edges);
    }
  }, [performUndo, nodes, setNodes, setEdges]);

  const redo = useCallback(() => {
    const result = performRedo(nodes, []);
    if (result) {
      setNodes(result.nodes as ProcessNode[]);
      setEdges(result.edges);
    }
  }, [performRedo, nodes, setNodes, setEdges]);

  const addActivity = useCallback(
    (activity: Activity & { position: { x: number; y: number } }) => {
      const nodeId = generateNodeId();
      const blockData = createActivityBlockData(activity, nodeId);

      const added = addNode({
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
    [addNode, selectNode]
  );

  const updateActivity = useCallback(
    (id: string, data: Partial<Pick<Activity, 'name' | 'category' | 'description'>>) => {
      const currentNode = nodes.find((node) => node.id === id);
      const currentActivity = currentNode?.data.activity;

      if (!currentActivity) {
        return;
      }

      const nextActivity = {
        ...currentActivity,
        ...data,
      };

      updateNode(id, {
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
    [nodes, updateNode]
  );

  const deleteActivity = useCallback(
    (id: string) => {
      removeNode(id);
    },
    [removeNode]
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
