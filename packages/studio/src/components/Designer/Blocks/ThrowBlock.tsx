import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { useTranslation } from 'react-i18next';

import { ProcessNodeData } from '../../../stores/processStore';
import { isThrowBlock } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function ThrowBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData;
  if (!blockData || !isThrowBlock(blockData)) return null;

  const message = blockData.message || t('throw', 'Error');

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="text-[10px] text-red-500 truncate w-full">
        {message}
      </div>
    </BaseBlock>
  );
}

export const ThrowBlock = memo(ThrowBlockComponent);
