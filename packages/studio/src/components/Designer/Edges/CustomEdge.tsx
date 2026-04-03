import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from '@reactflow/core';
import type { ConnectionData } from '../../../types/connections';
import { CONNECTION_STYLES } from '../../../types/connections';

interface CustomEdgeProps extends EdgeProps<ConnectionData> {
  isExecuting?: boolean;
}

function CustomEdgeComponent({
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
}: CustomEdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const connectionType = data?.type || 'normal';
  const connectionStyle = CONNECTION_STYLES[connectionType];

  const edgeStyle = {
    stroke: style?.stroke || connectionStyle.color,
    strokeWidth: style?.strokeWidth || connectionStyle.strokeWidth,
    strokeDasharray: style?.strokeDasharray || connectionStyle.strokeDasharray,
    opacity: selected ? 1 : 0.7,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...edgeStyle,
          ...(isExecuting && {
            strokeDasharray: '5,5',
            animation: 'dash 0.5s linear infinite',
          }),
        }}
        markerEnd={`url(#arrow-${connectionType})`}
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
              color: 'white',
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

export const CustomEdge = memo(CustomEdgeComponent);
