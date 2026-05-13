import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/processStore';
import { BaseBlock } from './BaseBlock';
import type { ForEachBlockData } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

const FOREACH_COLOR = { primary: '#0891B2', hover: '#0E7490', border: '#155E75' };

function ForEachBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData as ForEachBlockData | undefined;
  if (!blockData || blockData.type !== 'for-each') return null;

  const itemVariable = blockData.itemVariable || 'item';
  const collection = blockData.collection || 'items';

  return (
    <BaseBlock data={blockData} selected={selected} overrideColor={FOREACH_COLOR}>
      <div className="flex flex-col items-start w-full gap-0.5">
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ backgroundColor: '#ECFEFF', color: '#0891B2' }}
        >
          ⟳ {t('forEach')}
        </span>
        <span className="text-[10px] text-gray-500 truncate w-full">
          {itemVariable} in {collection}
        </span>
      </div>
    </BaseBlock>
  );
}

export const ForEachBlock = memo(ForEachBlockComponent);
