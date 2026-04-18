import { useCallback } from 'react';
import type { ProcessNodeData } from '../../../../stores/blockStore';
import { generateNestedId } from '../utils/paramUtils';

export interface UseBlockDataHandlersProps {
  selectedNodeId: string | null;
  selectedNode: { data: ProcessNodeData; id: string } | null;
  updateNode: (id: string, data: Partial<ProcessNodeData>) => void;
}

export interface BlockDataHandlers {
  handleUpdateNode: (updates: Partial<ProcessNodeData>) => void;
  updateBlockData: (updates: Record<string, unknown>) => void;
  updateActivityParam: (paramName: string, value: unknown) => void;
  updateBuiltinSettings: (updates: Partial<NonNullable<ProcessNodeData['builtinSettings']>>) => void;
  updateSwitchCase: (index: number, updates: { value?: string; label?: string }) => void;
  addSwitchCase: () => void;
  removeSwitchCase: (index: number) => void;
  updateParallelBranch: (index: number, updates: { name?: string }) => void;
  addParallelBranch: () => void;
  removeParallelBranch: (index: number) => void;
  updateExceptBlock: (index: number, updates: { exceptionType?: string; variable?: string }) => void;
  addExceptBlock: () => void;
  removeExceptBlock: (index: number) => void;
  toggleFinallyBlock: (enabled: boolean) => void;
}

export function useBlockDataHandlers({
  selectedNodeId,
  selectedNode,
  updateNode,
}: UseBlockDataHandlersProps): BlockDataHandlers {
  const handleUpdateNode = useCallback(
    (updates: Partial<ProcessNodeData>) => {
      if (!selectedNodeId) {
        return;
      }
      updateNode(selectedNodeId, updates);
    },
    [selectedNodeId, updateNode]
  );

  const updateBlockData = useCallback(
    (updates: Record<string, unknown>) => {
      if (!selectedNode?.data.blockData) {
        return;
      }
      handleUpdateNode({
        blockData: {
          ...selectedNode.data.blockData,
          ...updates,
        },
      });
    },
    [handleUpdateNode, selectedNode]
  );

  const updateActivityParam = useCallback(
    (paramName: string, value: unknown) => {
      if (selectedNode?.data.blockData?.type !== 'activity') {
        return;
      }
      handleUpdateNode({
        activityValues: {
          ...(selectedNode.data.activityValues || {}),
          [paramName]: value,
        },
        blockData: {
          ...selectedNode.data.blockData,
          params: {
            ...selectedNode.data.blockData.params,
            [paramName]: value,
          },
        },
      });
    },
    [handleUpdateNode, selectedNode]
  );

  const updateBuiltinSettings = useCallback(
    (updates: Partial<NonNullable<ProcessNodeData['builtinSettings']>>) => {
      handleUpdateNode({
        builtinSettings: {
          ...(selectedNode?.data.builtinSettings || {}),
          ...updates,
        },
      });
    },
    [handleUpdateNode, selectedNode]
  );

  const updateSwitchCase = useCallback(
    (index: number, updates: { value?: string; label?: string }) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'switch') {
        return;
      }
      const nextCases = selectedNode.data.blockData.cases.map((switchCase, currentIndex) =>
        currentIndex === index ? { ...switchCase, ...updates } : switchCase
      );
      updateBlockData({ cases: nextCases });
    },
    [selectedNode, updateBlockData]
  );

  const addSwitchCase = useCallback(() => {
    if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'switch') {
      return;
    }
    updateBlockData({
      cases: [
        ...selectedNode.data.blockData.cases,
        {
          id: generateNestedId('case'),
          value: '',
          label: `Case ${selectedNode.data.blockData.cases.length + 1}`,
        },
      ],
    });
  }, [selectedNode, updateBlockData]);

  const removeSwitchCase = useCallback(
    (index: number) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'switch') {
        return;
      }
      updateBlockData({
        cases: selectedNode.data.blockData.cases.filter((_, currentIndex) => currentIndex !== index),
      });
    },
    [selectedNode, updateBlockData]
  );

  const updateParallelBranch = useCallback(
    (index: number, updates: { name?: string }) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'parallel') {
        return;
      }
      updateBlockData({
        branches: selectedNode.data.blockData.branches.map((branch, currentIndex) =>
          currentIndex === index ? { ...branch, ...updates } : branch
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const addParallelBranch = useCallback(() => {
    if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'parallel') {
      return;
    }
    updateBlockData({
      branches: [
        ...selectedNode.data.blockData.branches,
        {
          id: generateNestedId('branch'),
          name: `Branch ${selectedNode.data.blockData.branches.length + 1}`,
          activities: [],
        },
      ],
    });
  }, [selectedNode, updateBlockData]);

  const removeParallelBranch = useCallback(
    (index: number) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'parallel') {
        return;
      }
      updateBlockData({
        branches: selectedNode.data.blockData.branches.filter(
          (_, currentIndex) => currentIndex !== index
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const updateExceptBlock = useCallback(
    (index: number, updates: { exceptionType?: string; variable?: string }) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
        return;
      }
      updateBlockData({
        exceptBlocks: selectedNode.data.blockData.exceptBlocks.map((exceptBlock, currentIndex) =>
          currentIndex === index ? { ...exceptBlock, ...updates } : exceptBlock
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const addExceptBlock = useCallback(() => {
    if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
      return;
    }
    updateBlockData({
      exceptBlocks: [
        ...selectedNode.data.blockData.exceptBlocks,
        {
          id: generateNestedId('except'),
          exceptionType: 'Exception',
          variable: '',
          handler: [],
        },
      ],
    });
  }, [selectedNode, updateBlockData]);

  const removeExceptBlock = useCallback(
    (index: number) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
        return;
      }
      updateBlockData({
        exceptBlocks: selectedNode.data.blockData.exceptBlocks.filter(
          (_, currentIndex) => currentIndex !== index
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const toggleFinallyBlock = useCallback(
    (enabled: boolean) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
        return;
      }
      updateBlockData({
        finallyBlock: enabled ? selectedNode.data.blockData.finallyBlock || [] : undefined,
      });
    },
    [selectedNode, updateBlockData]
  );

  return {
    handleUpdateNode,
    updateBlockData,
    updateActivityParam,
    updateBuiltinSettings,
    updateSwitchCase,
    addSwitchCase,
    removeSwitchCase,
    updateParallelBranch,
    addParallelBranch,
    removeParallelBranch,
    updateExceptBlock,
    addExceptBlock,
    removeExceptBlock,
    toggleFinallyBlock,
  };
}
