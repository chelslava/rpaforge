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
        ${selected ? 'ring-2 ring-offset-2 ring-ui-danger' : ''}
      `}
      role="img"
      data-node-id={id}
      aria-label={`End block: ${status}${blockData.label ? ' - ' + blockData.label : ''}`}
      style={{
        width: 160,
        height: 48,
        backgroundColor: isFail ? 'var(--color-ui-danger-hover)' : 'var(--color-block-end)',
        border: `2.5px solid ${isFail ? 'var(--color-ui-danger)' : 'var(--color-block-end-border)'}`,
        borderRadius: 24,
        boxShadow: '0 4px 10px color-mix(in srgb, var(--color-block-end) 35%, transparent)',
      }}
      tabIndex={0}
      onClick={() => onSelect?.(id)}
      onFocus={() => onSelect?.(id)}
    >
      <span className="text-ui-text-inverse font-bold text-sm tracking-widest uppercase leading-tight">
        ■ End
      </span>
      {isFail && (
        <span className="text-ui-text-inverse/80 text-[10px] leading-tight uppercase tracking-wider">
          {status}
        </span>
      )}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="w-3 h-3 border-2 border-ui-surface"
        style={{
          backgroundColor: 'var(--color-port-default)',
          left: '50%',
          top: 0,
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

export const EndBlock = memo(EndBlockComponent);
