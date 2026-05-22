import { memo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { BaseBlock } from './BaseBlock';
import { createActivityBlockData } from '../../../types/blocks';
import { getActivityDisplayLibrary } from '../../../types/engine';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { BLOCK_PORT_CONFIGS } from '../../../types/blocks';

const LIBRARY_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  WebUI:     { bg: '#DBEAFE', text: '#3B82F6' },
  DesktopUI: { bg: '#EDE9FE', text: '#8B5CF6' },
  Excel:     { bg: '#D1FAE5', text: '#10B981' },
  BuiltIn:   { bg: '#E0E7FF', text: '#6366F1' },
  File:      { bg: '#FEF3C7', text: '#F59E0B' },
};

function getLibraryBadgeColor(lib: string) {
  return LIBRARY_BADGE_COLORS[lib] ?? { bg: '#F3F4F6', text: '#6B7280' };
}

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
  const badgeColor = getLibraryBadgeColor(libraryName);
  const hasOutput = activity?.has_output ?? false;

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      onSelect={data.onSelect}
      portConfig={BLOCK_PORT_CONFIGS.activity}
      title={activity?.name || blockData.label}
    >
      <div className="flex flex-col items-start w-full gap-1">
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: badgeColor.bg, color: badgeColor.text }}
        >
          <span className="font-bold">{libraryName.charAt(0)}</span>
          <span>{libraryName}</span>
        </div>
        {hasOutput && (
          <span className="text-[9px] text-indigo-500 font-medium">→ result</span>
        )}
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
