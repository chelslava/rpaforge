import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function IfBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'if') return null;

  const condition = (blockData as any).condition || '${True}';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-2">
        <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200">
          <span className="text-gray-500">Condition:</span>
          <div className="text-gray-700 truncate">{condition}</div>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span className="text-green-600">● True</span>
          <span className="text-red-600">○ False</span>
        </div>
      </div>
    </BaseBlock>
  );
}

export const IfBlock = memo(IfBlockComponent);
