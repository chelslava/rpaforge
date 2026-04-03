import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function RetryScopeBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'retry-scope') return null;

  const retryCount = (blockData as any).retryCount || 3;
  const retryInterval = (blockData as any).retryInterval || '2s';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-orange-600">
          <span>↺ Retry</span>
        </div>
        <div className="font-mono text-xs text-gray-500">
          {retryCount}x, interval: {retryInterval}
        </div>
      </div>
    </BaseBlock>
  );
}

export const RetryScopeBlock = memo(RetryScopeBlockComponent);
