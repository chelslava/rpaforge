import { memo, useCallback } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getStraightPath, useReactFlow } from '@reactflow/core';
import type { ConnectionData } from '../../../types/connections';
import { CONNECTION_STYLES } from '../../../types/connections';
import { useBlockStore } from '../../../stores/blockStore';

interface BendPoint {
  id: string;
  x: number;
  y: number;
}

type BendableEdgeData = ConnectionData & { 
  bendPoints?: BendPoint[];
};

function BendableEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  markerEnd,
}: EdgeProps<BendableEdgeData>) {
  const { screenToFlowPosition } = useReactFlow();
  const updateEdge = useBlockStore((state) => state.updateEdge);
  
  const bendPoints = data?.bendPoints || [];

  const getPath = useCallback(() => {
    if (bendPoints.length === 0) {
      return getStraightPath({ sourceX, sourceY, targetX, targetY });
    }

    const points = [
      { x: sourceX, y: sourceY },
      ...bendPoints.map(p => ({ x: p.x, y: p.y })),
      { x: targetX, y: targetY },
    ];

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }

    const midX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const midY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
    return [path, midX, midY] as const;
  }, [bendPoints, sourceX, sourceY, targetX, targetY]);

  const [path, labelX, labelY] = getPath();
  const connectionType = data?.type || 'normal';
  const connectionStyle = CONNECTION_STYLES[connectionType];

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    
    const newPoint: BendPoint = {
      id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: flowPos.x,
      y: flowPos.y,
    };

    let insertIndex = bendPoints.length;
    
    if (bendPoints.length === 0) {
      insertIndex = 0;
    } else {
      let minDist = Infinity;
      
      for (let i = 0; i <= bendPoints.length; i++) {
        const p1 = i === 0 ? { x: sourceX, y: sourceY } : { x: bendPoints[i - 1].x, y: bendPoints[i - 1].y };
        const p2 = i === bendPoints.length ? { x: targetX, y: targetY } : { x: bendPoints[i].x, y: bendPoints[i].y };
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const dist = Math.hypot(flowPos.x - midX, flowPos.y - midY);
        
        if (dist < minDist) {
          minDist = dist;
          insertIndex = i;
        }
      }
    }
    
    const newPoints = [...bendPoints];
    newPoints.splice(insertIndex, 0, newPoint);
    
    updateEdge(id, { data: { ...data, bendPoints: newPoints } });
  }, [bendPoints, data, id, screenToFlowPosition, sourceX, sourceY, targetX, targetY, updateEdge]);

  const handlePointDelete = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    const newPoints = bendPoints.filter(p => p.id !== pointId);
    updateEdge(id, { data: { ...data, bendPoints: newPoints } });
  }, [bendPoints, data, id, updateEdge]);

  const handlePointDragStart = useCallback((e: React.MouseEvent, pointId: string) => {
    e.stopPropagation();
    e.preventDefault();
    
    let currentBendPoints = [...bendPoints];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const flowPos = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      currentBendPoints = currentBendPoints.map(p => 
        p.id === pointId ? { ...p, x: flowPos.x, y: flowPos.y } : p
      );
      updateEdge(id, { data: { ...data, bendPoints: currentBendPoints } });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [bendPoints, data, id, screenToFlowPosition, updateEdge]);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: connectionStyle.color,
          strokeWidth: selected ? connectionStyle.strokeWidth + 1 : connectionStyle.strokeWidth,
          strokeDasharray: connectionStyle.strokeDasharray,
          opacity: selected ? 1 : 0.85,
          cursor: 'pointer',
          filter: selected ? 'drop-shadow(0 0 4px rgba(99, 102, 241, 0.5))' : undefined,
          transition: 'stroke-width 0.15s, filter 0.15s',
        }}
        markerEnd={markerEnd}
        interactionWidth={20}
      />

      {selected && (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={24}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ cursor: 'crosshair', pointerEvents: 'stroke' }}
          onDoubleClick={handleDoubleClick}
        />
      )}

      {bendPoints.map((point) => (
        <g key={point.id} transform={`translate(${point.x}, ${point.y})`}>
          <circle
            r={7}
            fill="#6366f1"
            stroke="#fff"
            strokeWidth={2}
            style={{ 
              cursor: 'grab',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            }}
            onMouseDown={(e) => handlePointDragStart(e, point.id)}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => handlePointDelete(e, point.id)}
          />
          <circle r={3} fill="#fff" style={{ pointerEvents: 'none' }} />
        </g>
      ))}

      {selected && bendPoints.length === 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              backgroundColor: 'rgba(99, 102, 241, 0.95)',
              color: '#fff',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            Double-click to add bend point
          </div>
        </EdgeLabelRenderer>
      )}

      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY + (bendPoints.length > 0 ? 30 : 0)}px)`,
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

export const BendableEdge = memo(BendableEdgeComponent);
