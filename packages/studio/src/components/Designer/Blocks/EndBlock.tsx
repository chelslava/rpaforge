import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { EndBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function EndBlockComponent({ data, selected }: NodeProps<EndBlockData>) {
  const statusColor = data.status === 'PASS' ? 'text-green-600' : 'text-red-600';

  return (
    <BaseBlock data={data} selected={selected}>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${statusColor}`}>
          {data.status}
        </span>
      </div>
      {data.message && (
        <div className="text-xs text-gray-500 mt-1 truncate">
          {data.message}
        </div>
      )}
    </BaseBlock>
  );
}

export const EndBlock = memo(EndBlockComponent);
