import { getSmoothStepPath } from '@reactflow/core';
import type { ConnectionLineComponentProps } from '@reactflow/core';

export function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition }: ConnectionLineComponentProps) {
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    borderRadius: 12,
    offset: 40,
  });

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke="var(--color-ui-primary)"
        strokeWidth={2.5}
        strokeDasharray="6,3"
        style={{ animation: 'dashdraw 0.5s linear infinite' }}
      />
      <circle cx={toX} cy={toY} r={5} fill="var(--color-ui-primary)" />
    </g>
  );
}
