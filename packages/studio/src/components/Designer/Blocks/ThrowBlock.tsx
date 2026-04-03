import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function ThrowBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'throw') return null;

  const message = (blockData as any).message || 'Error occurred';
  const exceptionType = (blockData as any).exceptionType;

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-red-600">
          <span>⚡ Throw</span>
        </div>
        <div className="font-mono text-xs text-gray-500 truncate">
          {exceptionType ? `${exceptionType}: ` : ''}{message}
        </div>
      </div>
    </BaseBlock>
  );
}

export const ThrowBlock = memo(ThrowBlockComponent);
