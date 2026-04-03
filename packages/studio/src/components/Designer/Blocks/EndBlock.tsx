import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function EndBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'end') return null;

  const status = (blockData as any).status || 'PASS';
  const statusColor = status === 'PASS' ? 'text-green-600' : 'text-red-600';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="flex items-center gap-2">
        <span className={`font-medium ${statusColor}`}>{status}</span>
      </div>
    </BaseBlock>
  );
}

export const EndBlock = memo(EndBlockComponent);
