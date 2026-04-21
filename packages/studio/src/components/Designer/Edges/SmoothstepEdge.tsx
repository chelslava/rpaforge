import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from '@reactflow/core';
import type { ConnectionData } from '../../../types/connections';
import { CONNECTION_STYLES } from '../../../types/connections';

interface ConnectionDataExt extends ConnectionData {
  bendPoints?: Array<{ x: number; y: number }>;
}

interface SmoothstepEdgeProps extends EdgeProps<ConnectionDataExt> {
  isExecuting?: boolean;
}

function SmoothstepEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: SmoothstepEdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const connectionType = data?.type || 'normal';
  const connectionStyle = CONNECTION_STYLES[connectionType];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: connectionStyle.color,
          strokeWidth: connectionStyle.strokeWidth,
          strokeDasharray: connectionStyle.strokeDasharray,
          opacity: selected ? 1 : 0.8,
        }}
        markerEnd={markerEnd}
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
              pointerEvents: 'all',
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

export const SmoothstepEdge = memo(SmoothstepEdgeComponent);
