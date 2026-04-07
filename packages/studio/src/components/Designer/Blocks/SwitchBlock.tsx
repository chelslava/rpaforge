import { memo, useMemo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { BaseBlock } from './BaseBlock';
import { getSwitchPortConfig } from '../../../types/blocks';
import type { ProcessNodeData } from '../../../stores/processStore';

function SwitchBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  
  const portConfig = useMemo(() => {
    if (!blockData || blockData.type !== 'switch') return null;
    return getSwitchPortConfig(blockData);
  }, [blockData]);

  if (!blockData || blockData.type !== 'switch' || !portConfig) return null;

  const value = blockData.expression || '${variable}';

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={portConfig}
    >
      <div className="text-xs text-gray-500 truncate">
        Switch: {value}
      </div>
    </BaseBlock>
  );
}

export const SwitchBlock = memo(SwitchBlockComponent);
