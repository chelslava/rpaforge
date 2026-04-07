import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function ThrowBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'throw') return null;

  const message = (blockData as any).message || 'Error';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-red-500 truncate w-full">
        {message}
      </div>
    </BaseBlock>
  );
}

export const ThrowBlock = memo(ThrowBlockComponent);
