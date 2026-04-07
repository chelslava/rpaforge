import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function AssignBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'assign') return null;

  const variableName = (blockData as any).variableName || '';
  const expression = (blockData as any).expression || '';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-gray-500 truncate w-full">
        {variableName || '${var}'} = {expression || 'value'}
      </div>
    </BaseBlock>
  );
}

export const AssignBlock = memo(AssignBlockComponent);
