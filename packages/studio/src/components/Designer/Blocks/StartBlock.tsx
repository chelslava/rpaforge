import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function StartBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'start') return null;
  
  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="font-mono text-xs text-gray-700">
        {(blockData as any).processName || 'Main Process'}
      </div>
    </BaseBlock>
  );
}

export const StartBlock = memo(StartBlockComponent);
