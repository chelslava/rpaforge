import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { WhileBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function WhileBlockComponent({ data, selected }: NodeProps<WhileBlockData>) {
  return (
    <BaseBlock data={data} selected={selected}>
      <div className="space-y-2">
        <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200">
          <span className="text-gray-500">Condition:</span>
          <div className="text-gray-700 truncate">{data.condition}</div>
        </div>
        {data.maxIterations && (
          <div className="text-xs text-gray-500">
            Max iterations: {data.maxIterations}
          </div>
        )}
      </div>
    </BaseBlock>
  );
}

export const WhileBlock = memo(WhileBlockComponent);
