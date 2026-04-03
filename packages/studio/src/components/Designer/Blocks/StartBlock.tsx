import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { StartBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function StartBlockComponent({ data, selected }: NodeProps<StartBlockData>) {
  return (
    <BaseBlock data={data} selected={selected}>
      <div className="font-mono text-xs text-gray-700">
        {data.processName}
      </div>
      {data.tags && data.tags.length > 0 && (
        <div className="flex gap-1 mt-1 flex-wrap">
          {data.tags.map((tag: string) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </BaseBlock>
  );
}

export const StartBlock = memo(StartBlockComponent);
