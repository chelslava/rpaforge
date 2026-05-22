import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { ProcessNodeData } from '../../../stores/blockStore';
import { BaseBlock } from './BaseBlock';
import type { WhileBlockData } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

const WHILE_COLOR = { primary: '#7C3AED', hover: '#6D28D9', border: '#5B21B6' };

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
          style={{ backgroundColor: '#EDE9FE', color: '#7C3AED' }}
        >
          ↻ {t('while_loop')}
        </span>
        <span className="text-[10px] text-gray-500 truncate w-full">{condition}</span>
      </div>
    </BaseBlock>
  );
}

export const WhileBlock = memo(WhileBlockComponent);
