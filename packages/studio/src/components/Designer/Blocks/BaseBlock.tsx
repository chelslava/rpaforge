import { memo, type ReactNode } from 'react';
import { Handle, Position, useStore } from '@reactflow/core';
import { useTranslation } from 'react-i18next';

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

const HEADER_HEIGHT = 34;
const PORT_LABELS_AREA = 20;
const MIN_CONTENT_HEIGHT = 50;
const BASE_MIN_WIDTH = 200;
const MIN_PORT_SPACING = 40;

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

function getInputHandleLeft(index: number, total: number): string {
  if (total === 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
}

function getOutputHandleLeft(index: number, total: number): string {
  if (total === 1) return '50%';
  const step = 100 / (total + 1);
  return `${step * (index + 1)}%`;
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
  const { t } = useTranslation('blocks');
  const isConnecting = useStore(state => !!state.connectionNodeId);
  const fromHandleType = useStore(state => state.connectionHandleType);

  const colors = overrideColor || getBlockColors(data.category, data.type);
  const resolvedPortConfig = portConfig || BLOCK_PORT_CONFIGS[data.type];
  const resolvedIcon = icon || (isActivityBlock(data) ? data.icon : undefined) || BLOCK_ICONS[data.type];
  const resolvedTitle = title || data.label;

  const inputCount = resolvedPortConfig.inputs.length;
  const outputCount = resolvedPortConfig.outputs.length;
  const maxPortCount = Math.max(inputCount, outputCount);
  const minWidth = Math.max(BASE_MIN_WIDTH, (maxPortCount + 1) * MIN_PORT_SPACING);

  const contentHeight = MIN_CONTENT_HEIGHT;
  const totalHeight = HEADER_HEIGHT + contentHeight + PORT_LABELS_AREA;

  const hasOutputLabels = resolvedPortConfig.outputs.some(p => p.label) && outputCount > 1;
  const hasInputLabels = resolvedPortConfig.inputs.some(p => p.label) && inputCount > 1;

  return (
    <div
      className={`
        rounded-xl border-2 shadow-lg transition-all relative bg-white
        ${selected ? 'ring-2 ring-offset-2 ring-blue-500' : ''}
        ${isExecuting ? 'animate-pulse' : ''}
      `}
      style={{ borderColor: colors.border, height: totalHeight, minWidth }}
    >
      {hasBreakpoint && (
        <div
          className="absolute -left-1 -top-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm z-10"
          title={t('breakpoints.breakpoint')}
        />
      )}

      {isExecuting && (
        <div className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-[shimmer_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      <div
        className="flex items-center gap-2 rounded-t-xl px-3"
        style={{ backgroundColor: colors.primary, height: HEADER_HEIGHT }}
      >
        <span className="text-base leading-none">{resolvedIcon}</span>
        <span className="truncate text-sm font-semibold text-white">{resolvedTitle}</span>
      </div>

      {showPorts && hasInputLabels && (
        <div
          className="absolute top-0 left-0 right-0 flex"
          style={{ height: HEADER_HEIGHT, paddingTop: 2 }}
        >
          {resolvedPortConfig.inputs.map((port, index) => (
            <div
              key={`input-label-${port.id}`}
              className="absolute text-[9px] text-white/70 whitespace-nowrap"
              style={{
                left: getInputHandleLeft(index, inputCount),
                transform: 'translateX(-50%)',
                bottom: 2,
              }}
            >
              {port.label}
            </div>
          ))}
        </div>
      )}

      <div
        className="relative px-3 py-2 text-sm text-gray-600 flex items-center justify-center overflow-hidden"
        style={{ height: contentHeight }}
      >
        {children || <div className="italic text-gray-400 text-xs">{t('blocks.configure')}</div>}
      </div>

      {showPorts && hasOutputLabels && (
        <div
          className="absolute bottom-0 left-0 right-0 flex"
          style={{ height: PORT_LABELS_AREA }}
        >
          {resolvedPortConfig.outputs.map((port, index) => (
            <div
              key={`output-label-${port.id}`}
              className="absolute text-[9px] text-slate-500 whitespace-nowrap"
              style={{
                left: getOutputHandleLeft(index, outputCount),
                transform: 'translateX(-50%)',
                top: 3,
              }}
            >
              {port.label}
            </div>
          ))}
        </div>
      )}

      {showPorts && (
        <>
          {resolvedPortConfig.inputs.map((port, index) => {
            const highlighted = isConnecting && fromHandleType === 'source';
            return (
              <Handle
                key={port.id}
                type="target"
                position={Position.Top}
                id={port.id}
                title={port.label}
                className="w-3 h-3 border-2 border-white"
                style={{
                  left: getInputHandleLeft(index, inputCount),
                  top: 0,
                  transform: highlighted ? 'translate(-50%, -50%) scale(1.4)' : 'translate(-50%, -50%)',
                  backgroundColor: getHandleColor(port),
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                  ...(highlighted && {
                    boxShadow: '0 0 0 4px rgba(99,102,241,0.4), 0 0 12px rgba(99,102,241,0.3)',
                  }),
                }}
              />
            );
          })}
          {resolvedPortConfig.outputs.map((port, index) => {
            const highlighted = isConnecting && fromHandleType === 'target';
            return (
              <Handle
                key={port.id}
                type="source"
                position={Position.Bottom}
                id={port.id}
                title={port.label}
                className="w-3 h-3 border-2 border-white"
                style={{
                  left: getOutputHandleLeft(index, outputCount),
                  bottom: 0,
                  transform: highlighted ? 'translate(-50%, 50%) scale(1.4)' : 'translate(-50%, 50%)',
                  backgroundColor: getHandleColor(port),
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                  ...(highlighted && {
                    boxShadow: '0 0 0 4px rgba(99,102,241,0.4), 0 0 12px rgba(99,102,241,0.3)',
                  }),
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
