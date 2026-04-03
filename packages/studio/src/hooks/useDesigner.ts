/**
 * RPAForge useDesigner Hook
 *
 * Hook for managing designer state and actions.
 */

import { useCallback } from 'react';
import { useProcessStore } from '../stores/processStore';

export interface ActivityCategory {
  name: string;
  items: Array<{
    name: string;
    library: string;
    description: string;
    icon?: string;
  }>;
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
  
  selectNode: (id: string | null) => void;
  deselectNode: () => void;
  
  undo: () => void;
  redo: () => void;
  
  addActivity: (activity: {
    name: string;
    library: string;
    category: string;
    position: { x: number; y: number };
  }) => void;
  
  updateActivity: (id: string, data: Partial<{ name: string; library: string; category: string }>) => void;
  deleteActivity: (id: string) => void;
}

const ActivityCategories: ActivityCategory[] = [
  {
    name: 'Control Flow',
    items: [
      { name: 'IF', library: 'BuiltIn', description: 'Conditional statement' },
      { name: 'FOR', library: 'BuiltIn', description: 'Loop statement' },
      { name: 'WHILE', library: 'BuiltIn', description: 'While loop' },
    ],
  },
  {
    name: 'Logging',
    items: [
      { name: 'Log', library: 'BuiltIn', description: 'Log message' },
      { name: 'Log Many', library: 'BuiltIn', description: 'Log multiple messages' },
    ],
  },
  {
    name: 'Variables',
    items: [
      { name: 'Set Variable', library: 'BuiltIn', description: 'Set variable value' },
      { name: 'Get Variable', library: 'BuiltIn', description: 'Get variable value' },
    ],
  },
  {
    name: 'Desktop',
    items: [
      { name: 'Open Application', library: 'DesktopUI', description: 'Open desktop application' },
      { name: 'Click Element', library: 'DesktopUI', description: 'Click UI element' },
      { name: 'Input Text', library: 'DesktopUI', description: 'Input text' },
    ],
  },
  {
    name: 'Web',
    items: [
      { name: 'Open Browser', library: 'WebUI', description: 'Open web browser' },
      { name: 'Click Element', library: 'WebUI', description: 'Click web element' },
      { name: 'Input Text', library: 'WebUI', description: 'Input web text' },
    ],
  },
];

export const useDesigner = (): UseDesignerResult => {
  const processStore = useProcessStore();

  const categories = ActivityCategories;

  const selectedNode = processStore.selectedNodeId
    ? {
        id: processStore.selectedNodeId,
        position: { x: 0, y: 0 },
        data: processStore.nodes.find((n) => n.id === processStore.selectedNodeId)?.data || null,
      }
    : null;

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
    (activity: {
      name: string;
      library: string;
      category: string;
      position: { x: number; y: number };
    }) => {
      const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      processStore.addNode({
        id: nodeId,
        position: activity.position,
        data: {
          activity: {
            name: activity.name,
            library: activity.library,
            category: activity.category,
            description: '',
            arguments: [],
          },
          arguments: [],
          description: '',
          timeout: 30,
          continueOnError: false,
          tags: [],
        },
      });
      
      selectNode(nodeId);
    },
    [processStore, selectNode]
  );

  const updateActivity = useCallback(
    (id: string, data: Partial<{ name: string; library: string; category: string }>) => {
      processStore.updateNode(id, {
        activity: {
          name: data.name,
          library: data.library,
          category: data.category,
        } as any,
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
    selectNode,
    deselectNode,
    undo,
    redo,
    addActivity,
    updateActivity,
    deleteActivity,
  };
};

export default useDesigner;
