import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';
import type { ForEachBlockData } from '../../../types/blocks';

function ForEachBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData as ForEachBlockData | undefined;
  if (!blockData || blockData.type !== 'for-each') return null;

  const itemVariable = blockData.itemVariable || '${item}';
  const collection = blockData.collection || '@{list}';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-gray-500 truncate w-full">
        {itemVariable} in {collection}
      </div>
    </BaseBlock>
  );
}

export const ForEachBlock = memo(ForEachBlockComponent);
