import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function WhileBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'while') return null;

  const condition = (blockData as any).condition || '${True}';
  const maxIterations = (blockData as any).maxIterations;

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-2">
        <div className="font-mono text-xs bg-gray-50 p-2 rounded border border-gray-200">
          <span className="text-gray-500">Condition:</span>
          <div className="text-gray-700 truncate">{condition}</div>
        </div>
        {maxIterations && (
          <div className="text-xs text-gray-500">Max iterations: {maxIterations}</div>
        )}
      </div>
    </BaseBlock>
  );
}

export const WhileBlock = memo(WhileBlockComponent);
