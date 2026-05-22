import { memo } from 'react';
import type { NodeProps } from '@reactflow/core';
import {
  FiGlobe, FiTable, FiFile, FiWifi, FiMonitor,
  FiGrid, FiDatabase, FiZap, FiBox,
} from 'react-icons/fi';
import type { IconType } from 'react-icons';
import { BaseBlock } from './BaseBlock';
import { createActivityBlockData } from '../../../types/blocks';
import { getActivityDisplayLibrary } from '../../../types/engine';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { BLOCK_PORT_CONFIGS } from '../../../types/blocks';

const LIBRARY_BADGE_COLORS: Record<string, { bg: string; text: string; stripe: string }> = {
  WebUI:      { bg: '#DBEAFE', text: '#2563EB', stripe: '#3B82F6' },
  DesktopUI:  { bg: '#EDE9FE', text: '#7C3AED', stripe: '#8B5CF6' },
  Excel:      { bg: '#D1FAE5', text: '#059669', stripe: '#10B981' },
  BuiltIn:    { bg: '#E0E7FF', text: '#4F46E5', stripe: '#6366F1' },
  File:       { bg: '#FEF3C7', text: '#D97706', stripe: '#F59E0B' },
  HTTP:       { bg: '#FEE2E2', text: '#DC2626', stripe: '#EF4444' },
  DataFrames: { bg: '#CCFBF1', text: '#0F766E', stripe: '#14B8A6' },
  Database:   { bg: '#F5F3FF', text: '#6D28D9', stripe: '#7C3AED' },
};

const LIBRARY_ICONS: Record<string, IconType> = {
  WebUI:      FiGlobe,
  DesktopUI:  FiMonitor,
  Excel:      FiTable,
  File:       FiFile,
  HTTP:       FiWifi,
  DataFrames: FiGrid,
  Database:   FiDatabase,
  BuiltIn:    FiZap,
};

function getLibraryBadgeColor(lib: string) {
  return LIBRARY_BADGE_COLORS[lib] ?? { bg: '#F3F4F6', text: '#6B7280', stripe: '#9CA3AF' };
}

function getLibraryIcon(lib: string): IconType {
  return LIBRARY_ICONS[lib] ?? FiBox;
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
  const LibIcon = getLibraryIcon(libraryName);
  const activityTitle = activity?.name || blockData.label;

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      onSelect={data.onSelect}
      portConfig={BLOCK_PORT_CONFIGS.activity}
      title={activityTitle}
      libraryStripeColor={badgeColor.stripe}
    >
      <div className="flex flex-col items-start w-full gap-1.5">
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ backgroundColor: badgeColor.bg, color: badgeColor.text }}
          title={libraryName}
        >
          <LibIcon size={10} />
          <span>{libraryName}</span>
        </div>
        {activityTitle.length > 22 && (
          <span
            className="text-[10px] text-slate-500 leading-tight line-clamp-2 w-full"
            title={activityTitle}
          />
        )}
        {hasOutput && (
          <span className="text-[9px] text-indigo-500 font-medium">→ result</span>
        )}
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
