import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { TryCatchBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function TryCatchBlockComponent({ data, selected }: NodeProps<TryCatchBlockData>) {
  const exceptCount = data.exceptBlocks.length;

  return (
    <BaseBlock data={data} selected={selected}>
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1 text-green-600">
          <span>TRY</span>
          <span className="text-gray-400">(nested activities)</span>
        </div>
        {exceptCount > 0 && (
          <div className="flex items-center gap-1 text-orange-600">
            <span>EXCEPT</span>
            <span className="text-gray-400">({exceptCount} handler{exceptCount > 1 ? 's' : ''})</span>
          </div>
        )}
        {data.finallyBlock && (
          <div className="flex items-center gap-1 text-blue-600">
            <span>FINALLY</span>
            <span className="text-gray-400">(cleanup)</span>
          </div>
        )}
      </div>
    </BaseBlock>
  );
}

export const TryCatchBlock = memo(TryCatchBlockComponent);
