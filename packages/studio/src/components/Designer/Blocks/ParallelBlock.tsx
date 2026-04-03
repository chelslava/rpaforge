import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function ParallelBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'parallel') return null;

  const branches = (blockData as any).branches || [];

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs">
          <span className="text-teal-600 font-medium">⋮⋮ Parallel</span>
        </div>
        <div className="text-xs text-gray-400">
          {branches.length || 2} branch{branches.length !== 1 ? 'es' : ''}
        </div>
      </div>
    </BaseBlock>
  );
}

export const ParallelBlock = memo(ParallelBlockComponent);
