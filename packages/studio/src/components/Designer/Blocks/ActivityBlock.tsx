import { memo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { BaseBlock } from './BaseBlock';
import {
  createActivityBlockData,
  getActivityPortConfig,
} from '../../../types/blocks';
import { getActivityDisplayLibrary } from '../../../types/engine';
import type { ProcessNodeData } from '../../../stores/processStore';

function ActivityBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const activity = data.activity;
  const blockData =
    data.blockData?.type === 'activity' && data.blockData
      ? data.blockData
      : activity
      ? createActivityBlockData(activity, 'temp')
      : createActivityBlockData(
          {
            id: 'unknown',
            name: 'Activity',
            library: 'BuiltIn',
            type: 'sync',
            category: 'BuiltIn',
            description: '',
            icon: '⚙',
            ports: {
              inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
              outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
            },
            params: [],
            builtin: {
              timeout: true,
              retry: false,
              continueOnError: false,
              nested: false,
            },
            robotFramework: {
              keyword: 'Activity',
              library: 'BuiltIn',
            },
          },
          'temp'
        );

  const portConfig = activity ? getActivityPortConfig(activity) : undefined;
  const libraryName = activity ? getActivityDisplayLibrary(activity) : blockData.library;

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={portConfig}
      icon={activity?.icon || blockData.icon}
      title={activity?.name || blockData.label}
    >
      <div className="text-[10px] text-gray-500 truncate w-full">
        {libraryName}
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
