import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';

function SwitchBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData) return null;

  const cases = (blockData as any).cases || [];
  const value = (blockData as any).value || '${variable}';

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="font-mono text-xs text-gray-500">
          Switch on: {value}
        </div>
        <div className="text-xs text-gray-400">
          {cases.length} case{cases.length !== 1 ? 's' : ''}
        </div>
      </div>
    </BaseBlock>
  );
}

export const SwitchBlock = memo(SwitchBlockComponent);
