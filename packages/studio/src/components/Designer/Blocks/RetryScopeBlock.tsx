import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { useTranslation } from 'react-i18next';

import { ProcessNodeData } from '../../../stores/blockStore';
import { isRetryScopeBlock } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function RetryScopeBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData;
  if (!blockData || !isRetryScopeBlock(blockData)) return null;

  const retryCount = blockData.retryCount || 3;
  const retryInterval = blockData.retryInterval || '2s';

  return (
    <BaseBlock data={blockData} selected={selected} onSelect={data.onSelect}>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-orange-600">
          <span>↺ {t('retryScope')}</span>
        </div>
        <div className="font-mono text-xs text-gray-500">
          {retryCount}x, interval: {retryInterval}
        </div>
      </div>
    </BaseBlock>
  );
}

export const RetryScopeBlock = memo(RetryScopeBlockComponent);
