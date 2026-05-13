import { memo, useMemo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { useTranslation } from 'react-i18next';
import { BaseBlock } from './BaseBlock';
import { getParallelPortConfig } from '../../../types/blocks';
import type { ProcessNodeData } from '../../../stores/processStore';

function ParallelBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData;

  const portConfig = useMemo(() => {
    if (!blockData || blockData.type !== 'parallel') return null;
    return getParallelPortConfig(blockData);
  }, [blockData]);

  if (!blockData || blockData.type !== 'parallel' || !portConfig) return null;

  const branches = blockData.branches || [];
  const resolvedBranches =
    branches.length > 0
      ? branches
      : [
          { id: 'branch-1', name: t('parallel_branch1'), activities: [] },
          { id: 'branch-2', name: t('parallel_branch2'), activities: [] },
        ];

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={portConfig}
    >
      <div className="text-xs text-gray-500">
        {resolvedBranches.length} {t('parallel_branches')}
      </div>
    </BaseBlock>
  );
}

export const ParallelBlock = memo(ParallelBlockComponent);
