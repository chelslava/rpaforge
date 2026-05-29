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
      return 'var(--color-port-true)';
    case 'false':
      return 'var(--color-port-false)';
    case 'error':
      return 'var(--color-port-error)';
    case 'branch':
      return 'var(--color-port-branch)';
    case 'data':
      return 'var(--color-port-data)';
    default:
      return 'var(--color-port-default)';
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
        rounded-xl border-2 shadow-lg transition-all relative bg-ui-surface text-ui-text cursor-pointer focus-ring
        ${selected ? 'border-ui-primary ring-4 ring-ui-primary/30 shadow-xl' : ''}
        ${isFocused && !selected ? 'border-ui-focus-contrast ring-2 ring-offset-2 ring-ui-focus-contrast z-50' : ''}
        ${isExecuting || isCurrentlyRunning ? 'animate-pulse' : ''}
      `}
      style={{ borderColor: selected ? undefined : colors.border, height: totalHeight, minWidth }}
      tabIndex={0}
      role="button"
      aria-label={`${data.type} block: ${data.label || t('blocks.untitled')}`}
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
          className="absolute -left-1 -top-1 w-4 h-4 bg-ui-danger rounded-full border-2 border-ui-surface shadow-sm z-10"
          title={t('breakpoints.breakpoint')}
        />
      )}

      {/* Execution status indicator */}
      {resolvedStatus === 'running' && (
        <div className="absolute -right-1.5 -top-1.5 z-20">
          <div className="w-4 h-4 rounded-full bg-ui-info border-2 border-ui-surface shadow flex items-center justify-center animate-spin">
            <FiLoader size={8} className="text-ui-text-inverse" />
          </div>
          <div className="absolute inset-0 rounded-full bg-ui-info animate-ping opacity-60" />
        </div>
      )}
      {resolvedStatus === 'success' && (
        <div className="absolute -right-1.5 -top-1.5 z-20 w-4 h-4 rounded-full bg-ui-success border-2 border-ui-surface shadow flex items-center justify-center">
          <FiCheck size={8} className="text-ui-text-inverse" />
        </div>
      )}
      {resolvedStatus === 'error' && (
        <div className="absolute -right-1.5 -top-1.5 z-20 w-4 h-4 rounded-full bg-ui-danger border-2 border-ui-surface shadow flex items-center justify-center">
          <FiX size={8} className="text-ui-text-inverse" />
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
          backgroundColor: 'var(--color-block-header-bg)',
          height: HEADER_HEIGHT,
          paddingLeft: libraryStripeColor ? '0.875rem' : '0.75rem',
        }}
      >
        <span
          className="text-base leading-none"
          style={{ color: libraryStripeColor || 'var(--color-ui-text)' }}
        >
          {resolvedIcon}
        </span>
        <span
          className="truncate text-sm font-semibold"
          style={{ color: 'var(--color-block-header-text)' }}
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
              className="absolute text-[9px] whitespace-nowrap"
              style={{
                left: getInputHandleLeft(index, inputCount),
                transform: 'translateX(-50%)',
                bottom: 2,
                color: 'var(--color-block-header-text)',
                opacity: 0.7,
              }}
            >
              {port.label}
            </div>
          ))}
        </div>
      )}

      <div
        className="relative px-3 py-2 text-sm text-ui-text-muted flex items-center justify-center overflow-hidden"
        style={{ height: contentHeight }}
      >
        {children || <div className="italic text-ui-text-subtle text-xs">{t('blocks.configure')}</div>}
      </div>

      {showPorts && hasOutputLabels && (
        <div
          className="absolute bottom-0 left-0 right-0 flex"
          style={{ height: PORT_LABELS_AREA }}
        >
          {resolvedPortConfig.outputs.map((port, index) => (
            <div
              key={`output-label-${port.id}`}
              className="absolute text-[9px] text-ui-text-muted whitespace-nowrap"
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
                className="w-3 h-3 border-2 border-ui-surface"
                style={{
                  left: getInputHandleLeft(index, inputCount),
                  top: 0,
                  transform: highlighted ? 'translate(-50%, -50%) scale(1.4)' : 'translate(-50%, -50%)',
                  backgroundColor: getHandleColor(port),
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                  ...(highlighted && {
                    boxShadow:
                      '0 0 0 4px color-mix(in srgb, var(--color-ui-primary) 40%, transparent), 0 0 12px color-mix(in srgb, var(--color-ui-primary) 30%, transparent)',
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
                className="w-3 h-3 border-2 border-ui-surface"
                style={{
                  left: getOutputHandleLeft(index, outputCount),
                  bottom: 0,
                  transform: highlighted ? 'translate(-50%, 50%) scale(1.4)' : 'translate(-50%, 50%)',
                  backgroundColor: getHandleColor(port),
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                  ...(highlighted && {
                    boxShadow:
                      '0 0 0 4px color-mix(in srgb, var(--color-ui-primary) 40%, transparent), 0 0 12px color-mix(in srgb, var(--color-ui-primary) 30%, transparent)',
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
