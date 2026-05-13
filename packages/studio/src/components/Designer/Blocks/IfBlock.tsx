import { memo } from 'react';
import { Handle, Position } from '@reactflow/core';
import type { NodeProps } from '@reactflow/core';
import type { ProcessNodeData } from '../../../stores/processStore';
import { isIfBlock } from '../../../types/blocks';
import { useTranslation } from 'react-i18next';

const WIDTH = 200;
const HEIGHT = 100;
const HEX_CLIP = 'polygon(22px 0%, calc(100% - 22px) 0%, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0% 50%)';

function IfBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const { t } = useTranslation('blocks');
  const blockData = data.blockData;
  if (!blockData || !isIfBlock(blockData)) return null;

  const condition = blockData.condition || t('if_true');

  return (
    <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
      <div
        className="absolute inset-0"
        style={{
          clipPath: HEX_CLIP,
          filter: selected
            ? 'drop-shadow(0 0 5px rgba(59,130,246,0.9)) drop-shadow(0 4px 8px rgba(0,0,0,0.15))'
            : 'drop-shadow(0 4px 8px rgba(0,0,0,0.13))',
        }}
      >
        <div
          className="flex items-center gap-2 px-6"
          style={{ backgroundColor: '#D97706', height: 34 }}
        >
          <span className="text-base leading-none select-none">◆</span>
          <span className="text-sm font-bold text-white tracking-wide select-none">{t('if')}</span>
        </div>
        <div
          className="flex items-center justify-center px-8 text-center"
          style={{ backgroundColor: '#FFFBEB', height: HEIGHT - 34 - 18 }}
        >
          <span className="text-[10px] text-amber-800 truncate w-full">{condition}</span>
        </div>
        <div
          className="flex items-center"
          style={{ backgroundColor: '#FFFBEB', height: 18 }}
        >
          <span
            className="absolute text-[9px] font-semibold text-green-600"
            style={{ left: '33%', transform: 'translateX(-50%)' }}
          >
            {t('if_true')}
          </span>
          <span
            className="absolute text-[9px] font-semibold text-red-500"
            style={{ left: '67%', transform: 'translateX(-50%)' }}
          >
            {t('if_false')}
          </span>
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="w-3 h-3 border-2 border-white"
        style={{ backgroundColor: '#6B7280', left: '50%', top: 0, transform: 'translate(-50%, -50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"
        className="w-3 h-3 border-2 border-white"
        style={{ backgroundColor: '#22C55E', left: '33%', bottom: 0, transform: 'translate(-50%, 50%)' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"
        className="w-3 h-3 border-2 border-white"
        style={{ backgroundColor: '#EF4444', left: '67%', bottom: 0, transform: 'translate(-50%, 50%)' }}
      />
    </div>
  );
}

export const IfBlock = memo(IfBlockComponent);
