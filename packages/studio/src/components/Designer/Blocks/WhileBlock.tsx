import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';
import type { WhileBlockData } from '../../../types/blocks';

function WhileBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData as WhileBlockData | undefined;
  if (!blockData || blockData.type !== 'while') return null;

  const condition = blockData.condition || '${True}';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-gray-500 truncate w-full">
        {condition}
      </div>
    </BaseBlock>
  );
}

export const WhileBlock = memo(WhileBlockComponent);
