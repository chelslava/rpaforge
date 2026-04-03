import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { AssignBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function AssignBlockComponent({ data, selected }: NodeProps<AssignBlockData>) {
  const scopeColors: Record<string, string> = {
    local: 'text-gray-600',
    suite: 'text-blue-600',
    global: 'text-purple-600',
  };

  return (
    <BaseBlock data={data} selected={selected}>
      <div className="space-y-1 font-mono text-xs">
        <div className="flex items-center gap-1">
          <span className="text-blue-600">{data.variableName || '${variable}'}</span>
          <span className="text-gray-400">=</span>
        </div>
        <div className="bg-gray-50 p-1.5 rounded border border-gray-200 text-gray-700 truncate">
          {data.expression || 'value'}
        </div>
        <div className={`text-xs ${scopeColors[data.scope] || 'text-gray-600'}`}>
          Scope: {data.scope}
        </div>
      </div>
    </BaseBlock>
  );
}

export const AssignBlock = memo(AssignBlockComponent);
