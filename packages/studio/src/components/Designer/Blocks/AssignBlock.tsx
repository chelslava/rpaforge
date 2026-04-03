import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function AssignBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || blockData.type !== 'assign') return null;

  const variableName = (blockData as any).variableName || '';
  const expression = (blockData as any).expression || '';
  const scope = (blockData as any).scope || 'local';

  const scopeColors: Record<string, string> = {
    local: 'text-gray-600',
    suite: 'text-blue-600',
    global: 'text-purple-600',
  };

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex items-center gap-1">
          <span className="text-blue-600">{variableName || '${variable}'}</span>
          <span className="text-gray-400">=</span>
        </div>
        <div className="bg-gray-50 p-1.5 rounded border border-gray-200 text-gray-700 truncate">
          {expression || 'value'}
        </div>
        <div className={`text-xs ${scopeColors[scope] || 'text-gray-600'}`}>
          Scope: {scope}
        </div>
      </div>
    </BaseBlock>
  );
}

export const AssignBlock = memo(AssignBlockComponent);
