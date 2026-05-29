import { memo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { getLibraryNamespace, getActivityKey } from '../../../utils/activityI18n';

const LIBRARY_BADGE_COLORS: Record<string, { bg: string; text: string; stripe: string }> = {
  WebUI: {
    bg: 'var(--color-library-webui-soft)',
    text: 'var(--color-library-webui)',
    stripe: 'var(--color-library-webui)',
  },
  DesktopUI: {
    bg: 'var(--color-library-desktopui-soft)',
    text: 'var(--color-library-desktopui)',
    stripe: 'var(--color-library-desktopui)',
  },
  Excel: {
    bg: 'var(--color-library-excel-soft)',
    text: 'var(--color-library-excel)',
    stripe: 'var(--color-library-excel)',
  },
  BuiltIn: {
    bg: 'var(--color-library-builtin-soft)',
    text: 'var(--color-library-builtin)',
    stripe: 'var(--color-library-builtin)',
  },
  File: {
    bg: 'var(--color-library-file-soft)',
    text: 'var(--color-library-file)',
    stripe: 'var(--color-library-file)',
  },
  HTTP: {
    bg: 'var(--color-library-http-soft)',
    text: 'var(--color-library-http)',
    stripe: 'var(--color-library-http)',
  },
  DataFrames: {
    bg: 'var(--color-library-dataframes-soft)',
    text: 'var(--color-library-dataframes)',
    stripe: 'var(--color-library-dataframes)',
  },
  Database: {
    bg: 'var(--color-library-database-soft)',
    text: 'var(--color-library-database)',
    stripe: 'var(--color-library-database)',
  },
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
  return LIBRARY_BADGE_COLORS[lib] ?? {
    bg: 'var(--color-library-default-soft)',
    text: 'var(--color-library-default)',
    stripe: 'var(--color-library-default)',
  };
}

const LibraryBadgeIcon = memo(function LibraryBadgeIcon({ lib }: { lib: string }) {
  const Icon = LIBRARY_ICONS[lib] ?? FiBox;
  return <Icon size={10} />;
});

function ActivityBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
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

  const libraryNamespace = getLibraryNamespace(libraryName);
  const { t: tActivity } = useTranslation(libraryNamespace);
  const activityKey = activity ? getActivityKey(activity.id) : 'activity';
  const rawActivityName = activity?.name || blockData.label || 'Activity';
  const activityTitle = tActivity(`activities.${activityKey}.name`, { defaultValue: rawActivityName });
  const libraryDisplayName = tActivity('library', { defaultValue: libraryName });

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
          title={libraryDisplayName}
        >
          <LibraryBadgeIcon lib={libraryName} />
          <span>{libraryDisplayName}</span>
        </div>
        {hasOutput && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              color: 'var(--color-activity-output)',
              backgroundColor: 'var(--color-activity-output-bg)',
            }}
          >
            {t('resultIndicator')}
          </span>
        )}
      </div>
    </BaseBlock>
  );
}

export const ActivityBlock = memo(ActivityBlockComponent);
