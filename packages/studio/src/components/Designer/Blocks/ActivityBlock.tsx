import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ActivityBlockData } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function ActivityBlockComponent({ data, selected }: NodeProps<ActivityBlockData>) {
  return (
    <BaseBlock data={data} selected={selected}>
      <div className="space-y-1">
        <div className="font-mono text-xs text-gray-700">
          {data.name || 'Unknown Activity'}
        </div>
        {data.library && (
          <div className="text-xs text-gray-400">
            {data.library}
          </div>
        )}
        {Object.keys(data.arguments).length > 0 && (
          <div className="text-xs text-gray-500">
            {Object.keys(data.arguments).length} argument{Object.keys(data.arguments).length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
