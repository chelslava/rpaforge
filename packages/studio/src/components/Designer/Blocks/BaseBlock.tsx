import { memo, useState, type ReactNode } from 'react';
import { Handle, Position, useStore } from '@reactflow/core';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiX, FiLoader } from 'react-icons/fi';
import { useExecutionStore } from '../../../stores/executionStore';

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
  libraryStripeColor?: string;
  executionStatus?: 'running' | 'success' | 'error' | null;
  onSelect?: (id: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
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
  libraryStripeColor,
  executionStatus,
  onSelect,
  onKeyDown,
}: BaseBlockProps) {
  const { t } = useTranslation('blocks');
  const isConnecting = useStore(state => !!state.connectionNodeId);
  const fromHandleType = useStore(state => state.connectionHandleType);
  const currentExecutingNodeId = useExecutionStore(state => state.currentExecutingNodeId);

  const isCurrentlyRunning = currentExecutingNodeId === data.id;

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

  const [isFocused, setIsFocused] = useState(false);

  const hasVisualSelection = selected || isFocused;

  const resolvedStatus = executionStatus ?? (isCurrentlyRunning ? 'running' : null);

  return (
    <div
      className={`
        rounded-xl border-2 shadow-lg transition-all relative bg-white cursor-pointer focus-ring
        ${selected ? 'border-blue-500 ring-4 ring-blue-500/30 shadow-blue-200/60 shadow-xl' : ''}
        ${isFocused && !selected ? 'border-yellow-400 ring-2 ring-offset-2 ring-yellow-400 z-50' : ''}
        ${isExecuting || isCurrentlyRunning ? 'animate-pulse' : ''}
      `}
      style={{ borderColor: selected ? undefined : colors.border, height: totalHeight, minWidth }}
      tabIndex={0}
      role="button"
      aria-label={`${data.type} block: ${data.label || 'Untitled'}`}
      aria-selected={hasVisualSelection}
      aria-describedby={data.description ? `block-desc-${data.id}` : undefined}
      onFocus={() => {
        setIsFocused(true);
        onSelect?.(data.id);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          // actual blur
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(data.id);
        } else {
          onKeyDown?.(e);
        }
      }}
      onClick={() => onSelect?.(data.id)}
    >
      {/* Left library stripe */}
      {libraryStripeColor && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl z-10"
          style={{ backgroundColor: libraryStripeColor }}
        />
      )}

      {data.description && (
        <span id={`block-desc-${data.id}`} className="sr-only">
          {data.description}
        </span>
      )}

      {hasBreakpoint && (
        <div
          className="absolute -left-1 -top-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm z-10"
          title={t('breakpoints.breakpoint')}
        />
      )}

      {/* Execution status indicator */}
      {resolvedStatus === 'running' && (
        <div className="absolute -right-1.5 -top-1.5 z-20">
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow flex items-center justify-center animate-spin">
            <FiLoader size={8} className="text-white" />
          </div>
          <div className="absolute inset-0 rounded-full bg-blue-400 animate-ping opacity-60" />
        </div>
      )}
      {resolvedStatus === 'success' && (
        <div className="absolute -right-1.5 -top-1.5 z-20 w-4 h-4 rounded-full bg-green-500 border-2 border-white shadow flex items-center justify-center">
          <FiCheck size={8} className="text-white" />
        </div>
      )}
      {resolvedStatus === 'error' && (
        <div className="absolute -right-1.5 -top-1.5 z-20 w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow flex items-center justify-center">
          <FiX size={8} className="text-white" />
        </div>
      )}

      {(isExecuting || isCurrentlyRunning) && (
        <div className="absolute inset-0 rounded-xl pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-[shimmer_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      <div
        className="flex items-center gap-2 rounded-t-xl px-3"
        style={{
          backgroundColor: colors.primary,
          height: HEADER_HEIGHT,
          paddingLeft: libraryStripeColor ? '0.875rem' : '0.75rem',
        }}
      >
        <span className="text-base leading-none">{resolvedIcon}</span>
        <span
          className="truncate text-sm font-semibold text-white"
          title={resolvedTitle}
        >
          {resolvedTitle}
        </span>
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
