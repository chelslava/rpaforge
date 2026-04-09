import { memo } from 'react';
import { NodeProps } from '@reactflow/core';

import { ProcessNodeData } from '../../../stores/processStore';
import { isEndBlock } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function EndBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || !isEndBlock(blockData)) return null;

  const status = blockData.status || 'PASS';
  const statusColor = status === 'PASS' ? 'text-green-600' : 'text-red-600';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className={`text-[10px] font-medium ${statusColor}`}>
        {status}
      </div>
    </BaseBlock>
  );
}

export const EndBlock = memo(EndBlockComponent);
