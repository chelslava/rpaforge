import { memo } from 'react';
import { NodeProps } from '@reactflow/core';

import { ProcessNodeData } from '../../../stores/processStore';
import { isAssignBlock } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function AssignBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || !isAssignBlock(blockData)) return null;

  const variableName = blockData.variableName || '';
  const expression = blockData.expression || '';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-gray-500 truncate w-full">
        {variableName || '${var}'} = {expression || 'value'}
      </div>
    </BaseBlock>
  );
}

export const AssignBlock = memo(AssignBlockComponent);
