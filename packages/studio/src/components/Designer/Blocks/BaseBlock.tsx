import { memo, ReactNode } from 'react';
import { Handle, Position } from '@reactflow/core';
import {
  BlockData,
  BLOCK_COLORS,
  BLOCK_ICONS,
  BLOCK_PORT_CONFIGS,
  BlockCategory,
  Port,
} from '../../../types/blocks';

interface BaseBlockProps {
  data: BlockData;
  selected?: boolean;
  children?: ReactNode;
  showPorts?: boolean;
}

function BaseBlockComponent({ data, selected, children, showPorts = true }: BaseBlockProps) {
  const category = data.category as BlockCategory;
  const colors = BLOCK_COLORS[category];
  const icon = BLOCK_ICONS[data.type];
  const portConfig = BLOCK_PORT_CONFIGS[data.type];

  return (
    <div
      className={`
        min-w-[180px] rounded-lg shadow-md border-2 transition-all
        ${selected ? 'ring-2 ring-offset-2 ring-blue-500' : ''}
      `}
      style={{
        borderColor: colors.border,
        backgroundColor: 'white',
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-lg"
        style={{ backgroundColor: colors.primary }}
      >
        <span className="text-lg">{icon}</span>
        <span className="font-medium text-white text-sm truncate">{data.label}</span>
      </div>

      <div className="px-3 py-2 text-sm text-gray-600">
        {children || (
          <div className="text-gray-400 italic">Configure block...</div>
        )}
      </div>

      {showPorts && (
        <>
          {portConfig.inputs.map((port: Port) => (
            <Handle
              key={port.id}
              type="target"
              position={Position.Left}
              id={port.id}
              className="w-3 h-3 bg-gray-400 border-2 border-white"
              style={{
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
          ))}

          {portConfig.outputs.map((port: Port, index: number) => {
            const isConditional = port.type === 'true' || port.type === 'false';
            const portColor = port.type === 'true' ? '#22C55E' : port.type === 'false' ? '#EF4444' : '#6B7280';
            
            return (
              <Handle
                key={port.id}
                type="source"
                position={Position.Right}
                id={port.id}
                className={`w-3 h-3 border-2 border-white ${isConditional ? 'w-4 h-4' : ''}`}
                style={{
                  top: isConditional ? `${30 + index * 40}%` : '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: portColor,
                }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

export const BaseBlock = memo(BaseBlockComponent);
