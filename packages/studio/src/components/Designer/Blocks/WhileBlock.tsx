import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/blockStore';
import { BaseBlock } from './BaseBlock';
import type { WhileBlockData } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

const WHILE_COLOR = {
  primary: 'var(--color-block-while)',
  hover: 'var(--color-block-while-hover)',
  border: 'var(--color-block-while-border)',
};

function WhileBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData as WhileBlockData | undefined;
  if (!blockData || blockData.type !== 'while') return null;

  const condition = blockData.condition || 'True';

  return (
    <BaseBlock data={blockData} selected={selected} onSelect={data.onSelect} overrideColor={WHILE_COLOR}>
      <div className="flex flex-col items-start w-full gap-0.5">
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'var(--color-block-while-soft)', color: 'var(--color-block-while)' }}
        >
          ↻ {t('while_loop')}
        </span>
        <span className="text-[10px] text-ui-text-muted truncate w-full">{condition}</span>
      </div>
    </BaseBlock>
  );
}

export const WhileBlock = memo(WhileBlockComponent);
