import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function GetVariableBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'get-variable') return null;

  const variableName = (blockData as any).variableName || '';
  const outputVariable = (blockData as any).outputVariable || '';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        {variableName && (
          <div className="text-xs">
            <span className="text-gray-500">From:</span>{' '}
            <span className="font-mono text-gray-700">{variableName}</span>
          </div>
        )}
        {outputVariable && (
          <div className="text-xs">
            <span className="text-gray-500">To:</span>{' '}
            <span className="font-mono text-gray-700">{outputVariable}</span>
          </div>
        )}
        {!variableName && !outputVariable && (
          <div className="text-gray-400 italic text-xs">Configure variable...</div>
        )}
      </div>
    </BaseBlock>
  );
}

export const GetVariableBlock = memo(GetVariableBlockComponent);
