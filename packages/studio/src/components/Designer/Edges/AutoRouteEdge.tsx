import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
} from '@reactflow/core';
import type { ConnectionData } from '../../../types/connections';
import { CONNECTION_STYLES } from '../../../types/connections';

interface AutoRouteEdgeProps extends EdgeProps<ConnectionData> {
  isExecuting?: boolean;
}

function AutoRouteEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  selected,
  isExecuting,
}: AutoRouteEdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    offset: 40,
  });

  const connectionType = data?.type || 'normal';
  const connectionStyle = CONNECTION_STYLES[connectionType];

  const isExecutingActual = isExecuting ?? data?.animated ?? false;

  const edgeStyle = {
    stroke: style?.stroke || connectionStyle.color,
    strokeWidth: (style?.strokeWidth as number || connectionStyle.strokeWidth) + (selected ? 1 : 0),
    strokeDasharray: isExecutingActual
      ? '5,5'
      : (style?.strokeDasharray || connectionStyle.strokeDasharray),
    opacity: selected ? 1 : 0.7,
    ...(isExecutingActual && {
      animation: 'dash 0.5s linear infinite',
    }),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd="url(#arrow)"
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 4px',
              borderRadius: 4,
              backgroundColor: connectionStyle.color,
              color: 'var(--color-ui-text-inverse)',
            }}
            className="nodrag nopan"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const AutoRouteEdge = memo(AutoRouteEdgeComponent);
