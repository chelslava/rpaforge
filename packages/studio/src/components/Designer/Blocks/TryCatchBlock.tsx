import { memo, useMemo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { BaseBlock } from './BaseBlock';
import { getTryCatchPortConfig } from '../../../types/blocks';
import type { ProcessNodeData } from '../../../stores/processStore';

function TryCatchBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;

  const portConfig = useMemo(() => {
    if (!blockData || blockData.type !== 'try-catch') return null;
    return getTryCatchPortConfig(blockData);
  }, [blockData]);

  if (!blockData || blockData.type !== 'try-catch' || !portConfig) return null;

  const exceptBlocks = blockData.exceptBlocks || [];
  const finallyBlock = blockData.finallyBlock;
  const exceptCount = exceptBlocks.length;

  return (
    <BaseBlock
      data={blockData}
      selected={selected}
      portConfig={portConfig}
    >
      <div className="text-xs text-gray-500">
        TRY{exceptCount > 0 && ` / ${exceptCount} EXCEPT`}{finallyBlock && ' / FINALLY'}
      </div>
    </BaseBlock>
  );
}

export const TryCatchBlock = memo(TryCatchBlockComponent);
