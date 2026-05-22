import { memo } from 'react';
import { Handle, Position } from '@reactflow/core';
import type { NodeProps } from '@reactflow/core';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { isStartBlock } from '../../../types/blocks';

function StartBlockComponent({ data, selected, id }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  const onSelect = data.onSelect;
  if (!blockData || !isStartBlock(blockData)) return null;

  return (
    <div
      className={`
        relative flex items-center justify-center select-none transition-all
        ${selected ? 'ring-2 ring-offset-2 ring-green-400' : ''}
      `}
      role="img"
      data-node-id={id}
      aria-label={`Start block${blockData.label ? ': ' + blockData.label : ''}`}
      style={{
        width: 160,
        height: 48,
        backgroundColor: '#22C55E',
        border: '2.5px solid #16A34A',
        borderRadius: 24,
        boxShadow: '0 4px 10px rgba(34,197,94,0.35)',
      }}
      tabIndex={0}
      onClick={() => onSelect?.(id)}
      onFocus={() => onSelect?.(id)}
    >
      <span className="text-white font-bold text-sm tracking-widest uppercase select-none">
        ▶ Start
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="w-3 h-3 border-2 border-white"
        style={{
          backgroundColor: '#6B7280',
          left: '50%',
          bottom: 0,
          transform: 'translate(-50%, 50%)',
        }}
      />
    </div>
  );
}

export const StartBlock = memo(StartBlockComponent);
