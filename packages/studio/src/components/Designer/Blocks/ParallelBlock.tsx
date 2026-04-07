import { memo, useMemo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { BaseBlock } from './BaseBlock';
import { getParallelPortConfig } from '../../../types/blocks';
import type { ProcessNodeData } from '../../../stores/processStore';

function ParallelBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;

  const portConfig = useMemo(() => {
    if (!blockData || blockData.type !== 'parallel') return null;
    return getParallelPortConfig(blockData);
  }, [blockData]);

  if (!blockData || blockData.type !== 'parallel' || !portConfig) return null;

  const branches = blockData.branches || [];
  const resolvedBranches =
    branches.length > 0
      ? branches
      : [
          { id: 'branch-1', name: 'Branch 1', activities: [] },
          { id: 'branch-2', name: 'Branch 2', activities: [] },
        ];

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={portConfig}
    >
      <div className="text-xs text-gray-500">
        {resolvedBranches.length} branches
      </div>
    </BaseBlock>
  );
}

export const ParallelBlock = memo(ParallelBlockComponent);
