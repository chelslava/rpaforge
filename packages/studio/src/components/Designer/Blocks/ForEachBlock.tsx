import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/blockStore';
import { BaseBlock } from './BaseBlock';
import type { ForEachBlockData } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

const FOREACH_COLOR = {
  primary: 'var(--color-block-for-each)',
  hover: 'var(--color-block-for-each-hover)',
  border: 'var(--color-block-for-each-border)',
};

function ForEachBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData as ForEachBlockData | undefined;
  if (!blockData || blockData.type !== 'for-each') return null;

  const itemVariable = blockData.itemVariable || 'item';
  const collection = blockData.collection || 'items';

  return (
    <BaseBlock data={blockData} selected={selected} onSelect={data.onSelect} overrideColor={FOREACH_COLOR}>
      <div className="flex flex-col items-start w-full gap-0.5">
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--color-block-for-each-soft)', color: 'var(--color-block-for-each)' }}
        >
          ⟳ {t('forEach')}
        </span>
        <span className="text-[10px] text-ui-text-muted truncate w-full">
          {itemVariable} in {collection}
        </span>
      </div>
    </BaseBlock>
  );
}

export const ForEachBlock = memo(ForEachBlockComponent);
