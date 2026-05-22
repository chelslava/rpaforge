import { memo } from 'react';
import { Handle, Position } from '@reactflow/core';
import type { NodeProps } from '@reactflow/core';
import type { ProcessNodeData } from '../../../stores/blockStore';
import { isIfBlock } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

const WIDTH = 200;
const HEIGHT = 100;
const HEX_CLIP = 'polygon(22px 0%, calc(100% - 22px) 0%, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0% 50%)';

function IfBlockComponent({ data, selected, id }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData;
  const onSelect = data.onSelect;
  if (!blockData || !isIfBlock(blockData)) return null;

  const condition = blockData.condition || t('if_true');

  return (
    <div
      className="relative focus-ring"
      role="img"
      data-node-id={id}
      tabIndex={0}
      aria-label={`Decision block: ${condition} - True path connects below, False path connects right`}
      style={{ width: WIDTH, height: HEIGHT }}
      onClick={() => onSelect?.(id)}
      onFocus={() => onSelect?.(id)}
    >
      <div
        className="absolute inset-0"
        style={{
          clipPath: HEX_CLIP,
          filter: selected
            ? 'drop-shadow(0 0 5px color-mix(in srgb, var(--color-ui-primary) 90%, transparent)) drop-shadow(0 4px 8px rgb(0 0 0 / 0.15))'
            : 'drop-shadow(0 4px 8px rgb(0 0 0 / 0.13))',
        }}
      >
        <div
          className="flex items-center gap-2 px-6"
          style={{ backgroundColor: 'var(--color-block-if)', height: 34 }}
        >
          <span className="text-base leading-none select-none">◆</span>
          <span className="text-sm font-bold text-ui-text-inverse tracking-wide select-none">{t('if')}</span>
        </div>
        <div
          className="flex items-center justify-center px-8 text-center"
          style={{ backgroundColor: 'var(--color-block-if-soft)', height: HEIGHT - 34 - 18 }}
        >
          <span className="text-[10px] truncate w-full" style={{ color: 'var(--color-block-if-text)' }}>
            {condition}
          </span>
        </div>
        <div
          className="flex items-center"
          style={{ backgroundColor: 'var(--color-block-if-soft)', height: 18 }}
        >
          <span
            className="absolute text-[9px] font-semibold"
            style={{ left: '33%', transform: 'translateX(-50%)', color: 'var(--color-port-true)' }}
          >
            {t('if_true')}
          </span>
          <span
            className="absolute text-[9px] font-semibold"
            style={{ left: '67%', transform: 'translateX(-50%)', color: 'var(--color-port-false)' }}
          >
            {t('if_false')}
          </span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="w-3 h-3 border-2 border-ui-surface"
        style={{ backgroundColor: 'var(--color-port-default)', left: '50%', top: 0, transform: 'translate(-50%, -50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="w-3 h-3 border-2 border-ui-surface"
        style={{ backgroundColor: 'var(--color-port-true)', left: '33%', bottom: 0, transform: 'translate(-50%, 50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="w-3 h-3 border-2 border-ui-surface"
        style={{ backgroundColor: 'var(--color-port-false)', left: '67%', bottom: 0, transform: 'translate(-50%, 50%)' }}
      />
    </div>
  );
}

export const IfBlock = memo(IfBlockComponent);
