import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function ForEachBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'for-each') return null;

  const itemVariable = (blockData as any).itemVariable || '${item}';
  const collection = (blockData as any).collection || '@{list}';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="font-mono text-xs">
          <span className="text-gray-500">Item:</span>{' '}
          <span className="text-blue-600">{itemVariable}</span>
        </div>
        <div className="font-mono text-xs">
          <span className="text-gray-500">In:</span>{' '}
          <span className="text-purple-600">{collection}</span>
        </div>
      </div>
    </BaseBlock>
  );
}

export const ForEachBlock = memo(ForEachBlockComponent);
