import { memo, useMemo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { useTranslation } from 'react-i18next';
import { BaseBlock } from './BaseBlock';
import { getSwitchPortConfig } from '../../../types/blocks';
import type { ProcessNodeData } from '../../../stores/blockStore';

function SwitchBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData;
  
  const portConfig = useMemo(() => {
    if (!blockData || blockData.type !== 'switch') return null;
    return getSwitchPortConfig(blockData);
  }, [blockData]);

  if (!blockData || blockData.type !== 'switch' || !portConfig) return null;

  const value = blockData.expression || 'variable';

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={portConfig}
      onSelect={data.onSelect}
    >
      <div className="text-xs text-gray-500 truncate">
        {t('switch')}: {value}
      </div>
    </BaseBlock>
  );
}

export const SwitchBlock = memo(SwitchBlockComponent);
