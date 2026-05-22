import { memo } from 'react';
import { Handle, Position } from '@reactflow/core';
import type { NodeProps } from '@reactflow/core';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { isEndBlock } from '../../../types/blocks';

function EndBlockComponent({ data, selected, id }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  const onSelect = data.onSelect;
  if (!blockData || !isEndBlock(blockData)) return null;

  const status = blockData.status || 'PASS';
  const isFail = status === 'FAIL';

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center select-none transition-all gap-0.5
        ${selected ? 'ring-2 ring-offset-2 ring-red-400' : ''}
      `}
      role="img"
      data-node-id={id}
      aria-label={`End block: ${status}${blockData.label ? ' - ' + blockData.label : ''}`}
      style={{
        width: 160,
        height: 48,
        backgroundColor: isFail ? '#991B1B' : '#EF4444',
        border: `2.5px solid ${isFail ? '#7F1D1D' : '#DC2626'}`,
        borderRadius: 24,
        boxShadow: '0 4px 10px rgba(239,68,68,0.35)',
      }}
      tabIndex={0}
      onClick={() => onSelect?.(id)}
      onFocus={() => onSelect?.(id)}
    >
      <span className="text-white font-bold text-sm tracking-widest uppercase leading-tight">
        ■ End
      </span>
      {isFail && (
        <span className="text-white/80 text-[10px] leading-tight uppercase tracking-wider">
          {status}
        </span>
      )}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="w-3 h-3 border-2 border-white"
        style={{
          backgroundColor: '#6B7280',
          left: '50%',
          top: 0,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

export const EndBlock = memo(EndBlockComponent);
