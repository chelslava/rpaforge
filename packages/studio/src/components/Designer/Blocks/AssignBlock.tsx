import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { NodeProps } from '@reactflow/core';

import { ProcessNodeData } from '../../../stores/blockStore';
import { isAssignBlock } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function AssignBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('common');
  const blockData = data.blockData;
  if (!blockData || !isAssignBlock(blockData)) return null;

  const variableName = blockData.variableName || '';
  const expression = blockData.expression || '';

  return (
    <BaseBlock data={blockData} selected={selected} onSelect={data.onSelect}>
      <div className="text-[10px] text-ui-text-muted truncate w-full">
        {variableName || t('common.propertyPanel.varPlaceholder', { defaultValue: 'var' })} = {expression || t('common.propertyPanel.varEqualsValue', { defaultValue: 'var = value' }).split(' = ')[1]}
      </div>
    </BaseBlock>
  );
}

export const AssignBlock = memo(AssignBlockComponent);
