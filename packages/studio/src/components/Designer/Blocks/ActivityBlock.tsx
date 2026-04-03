import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';
import { createDefaultBlockData } from '../../../types/blocks';

function ActivityBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData || createDefaultBlockData('activity', 'temp');
  const name = data.activity?.name || blockData.name || 'Activity';
  const library = (blockData as any)?.library || 'library';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="font-mono text-xs text-gray-700">{name}</div>
        <div className="text-xs text-gray-400">{library}</div>
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
