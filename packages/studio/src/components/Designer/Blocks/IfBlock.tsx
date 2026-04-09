import { memo } from 'react';
import { NodeProps } from '@reactflow/core';

import { ProcessNodeData } from '../../../stores/processStore';
import { isIfBlock } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function IfBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || !isIfBlock(blockData)) return null;

  const condition = blockData.condition || '${True}';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-gray-500 truncate w-full">
        {condition}
      </div>
    </BaseBlock>
  );
}

export const IfBlock = memo(IfBlockComponent);
