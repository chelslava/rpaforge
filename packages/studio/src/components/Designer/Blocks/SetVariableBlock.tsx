import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function SetVariableBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'set-variable') return null;

  const variableName = (blockData as any).variableName || '';
  const value = (blockData as any).value || '';
  const scope = (blockData as any).scope || 'local';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        {variableName && (
          <div className="text-xs">
            <span className="font-mono text-gray-700">{variableName}</span>
            {value && (
              <>
                <span className="text-gray-400"> = </span>
                <span className="font-mono text-blue-600">{value}</span>
              </>
            )}
          </div>
        )}
        <div className="text-xs text-gray-400">
          Scope: <span className="capitalize">{scope}</span>
        </div>
        {!variableName && (
          <div className="text-gray-400 italic text-xs">Configure variable...</div>
        )}
      </div>
    </BaseBlock>
  );
}

export const SetVariableBlock = memo(SetVariableBlockComponent);
