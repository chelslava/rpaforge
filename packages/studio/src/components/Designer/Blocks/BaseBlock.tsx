import { memo, type ReactNode } from 'react';
import { Handle, Position } from '@reactflow/core';

import {
  BLOCK_ICONS,
  BLOCK_PORT_CONFIGS,
  getBlockColors,
  isActivityBlock,
  type BlockColor,
  type BlockData,
  type BlockPortConfig,
  type Port,
} from '../../../types/blocks';

interface BaseBlockProps {
  data: BlockData;
  selected?: boolean;
  children?: ReactNode;
  showPorts?: boolean;
  overrideColor?: BlockColor;
  portConfig?: BlockPortConfig;
  icon?: string;
  title?: string;
  hasBreakpoint?: boolean;
  isExecuting?: boolean;
}

const HEADER_HEIGHT = 36;
const PORT_HEIGHT = 22;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 12;

function getHandleColor(port: Port): string {
  switch (port.type) {
    case 'true':
      return '#22C55E';
    case 'false':
      return '#EF4444';
    case 'error':
      return '#F59E0B';
    case 'branch':
      return '#14B8A6';
    case 'data':
      return '#6366F1';
    default:
      return '#6B7280';
  }
}

function BaseBlockComponent({
  data,
  selected,
  children,
  showPorts = true,
  overrideColor,
  portConfig,
  icon,
  title,
  hasBreakpoint,
  isExecuting,
}: BaseBlockProps) {
  const colors = overrideColor || getBlockColors(data.category, data.type);
  const resolvedPortConfig = portConfig || BLOCK_PORT_CONFIGS[data.type];
  const resolvedIcon = icon || (isActivityBlock(data) ? data.icon : undefined) || BLOCK_ICONS[data.type];
  const resolvedTitle = title || data.label;

  const maxPorts = Math.max(
    resolvedPortConfig.inputs.length,
    resolvedPortConfig.outputs.length
  );
  
  const portsHeight = maxPorts * PORT_HEIGHT;
  const contentHeight = Math.max(50, portsHeight + PADDING_TOP + PADDING_BOTTOM);
  const totalHeight = HEADER_HEIGHT + contentHeight;

  const getOutputHandleTop = (index: number): number => {
    return HEADER_HEIGHT + PADDING_TOP + (index + 0.5) * PORT_HEIGHT;
  };

  const hasOutputLabels = resolvedPortConfig.outputs.some(p => p.label) && resolvedPortConfig.outputs.length > 1;
  const hasInputLabels = resolvedPortConfig.inputs.some(p => p.label) && resolvedPortConfig.inputs.length > 1;

  return (
    <div
      className={`
        min-w-[180px] rounded-lg border-2 bg-white shadow-md transition-all relative
        ${selected ? 'ring-2 ring-offset-2 ring-blue-500' : ''}
        ${isExecuting ? 'ring-2 ring-offset-2 ring-indigo-500 animate-pulse' : ''}
      `}
      style={{ borderColor: colors.border, height: totalHeight }}
    >
      {hasBreakpoint && (
        <div
          className="absolute -left-1 -top-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm z-10"
          title="Breakpoint"
        />
      )}
      
      <div
        className="flex items-center gap-2 rounded-t-lg px-3 py-2"
        style={{ backgroundColor: colors.primary, height: HEADER_HEIGHT }}
      >
        <span className="text-lg">{resolvedIcon}</span>
        <span className="truncate text-sm font-medium text-white">{resolvedTitle}</span>
      </div>

      <div 
        className="relative text-sm text-gray-600 flex"
        style={{ height: contentHeight }}
      >
        <div className="flex-1 px-2 flex items-center justify-center overflow-hidden">
          {children || <div className="italic text-gray-400 text-xs">Configure...</div>}
        </div>

        {showPorts && hasOutputLabels && (
          <div 
            className="flex flex-col pr-2"
            style={{ paddingTop: PADDING_TOP }}
          >
            {resolvedPortConfig.outputs.map((port) => (
              <div
                key={`output-label-${port.id}`}
                className="text-[9px] text-slate-500 whitespace-nowrap"
                style={{ height: PORT_HEIGHT, lineHeight: `${PORT_HEIGHT}px` }}
              >
                {port.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {showPorts && (
        <>
          {resolvedPortConfig.inputs.map((port) => (
            <Handle
              key={port.id}
              type="target"
              position={Position.Left}
              id={port.id}
              className="w-3 h-3 border-2 border-white"
              style={{
                top: `${HEADER_HEIGHT + contentHeight / 2}px`,
                transform: 'translateY(-50%)',
                backgroundColor: getHandleColor(port),
              }}
            />
          ))}
          {resolvedPortConfig.outputs.map((port, index) => (
            <Handle
              key={port.id}
              type="source"
              position={Position.Right}
              id={port.id}
              className="w-3 h-3 border-2 border-white"
              style={{
                top: `${getOutputHandleTop(index)}px`,
                transform: 'translateY(-50%)',
                backgroundColor: getHandleColor(port),
              }}
            />
          ))}
        </>
      )}

      {showPorts && hasInputLabels && (
        <div
          className="absolute left-2 flex flex-col"
          style={{ top: HEADER_HEIGHT + PADDING_TOP }}
        >
          {resolvedPortConfig.inputs.map((port) => (
            <div
              key={`input-label-${port.id}`}
              className="text-[10px] text-slate-500 whitespace-nowrap"
              style={{ height: PORT_HEIGHT, lineHeight: `${PORT_HEIGHT}px` }}
            >
              {port.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const BaseBlock = memo(BaseBlockComponent);
