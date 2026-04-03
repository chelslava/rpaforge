import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ForEachBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function ForEachBlockComponent({ data, selected }: NodeProps<ForEachBlockData>) {
  return (
    <BaseBlock data={data} selected={selected}>
      <div className="space-y-1">
        <div className="font-mono text-xs">
          <span className="text-gray-500">Item:</span>{' '}
          <span className="text-blue-600">{data.itemVariable}</span>
        </div>
        <div className="font-mono text-xs">
          <span className="text-gray-500">In:</span>{' '}
          <span className="text-purple-600">{data.collection}</span>
        </div>
      </div>
    </BaseBlock>
  );
}

export const ForEachBlock = memo(ForEachBlockComponent);
