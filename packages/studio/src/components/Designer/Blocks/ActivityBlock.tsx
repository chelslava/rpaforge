import { memo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { BaseBlock } from './BaseBlock';
import { createActivityBlockData } from '../../../types/blocks';
import { getActivityDisplayLibrary } from '../../../types/engine';
import type { ProcessNodeData } from '../../../stores/processStore';
import { BLOCK_PORT_CONFIGS } from '../../../types/blocks';

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
            tags: [],
            timeout_ms: 30000,
            has_retry: false,
            has_continue_on_error: false,
            params: [],
            has_output: false,
            output_description: '',
          },
          'temp'
        );

  const libraryName = activity ? getActivityDisplayLibrary(activity) : blockData.library;

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={BLOCK_PORT_CONFIGS.activity}
      title={activity?.name || blockData.label}
    >
      <div className="text-[11px] font-medium text-slate-600 truncate w-full mt-1">
        <span className="opacity-70">in</span> {libraryName}
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
