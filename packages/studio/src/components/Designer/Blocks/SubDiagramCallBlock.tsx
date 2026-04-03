import { memo } from 'react';
import { NodeProps } from '@reactflow/core';
import { SubDiagramCallBlockData, BLOCK_COLORS } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function SubDiagramCallBlockComponent({ data, selected }: NodeProps<SubDiagramCallBlockData>) {
  const colors = BLOCK_COLORS['sub-diagram'];
  const paramCount = Object.keys(data.parameters).length;
  const returnCount = Object.keys(data.returns).length;

  return (
    <BaseBlock data={data} selected={selected}>
      <div className="space-y-1">
        <div className="font-medium text-sm" style={{ color: colors.primary }}>
          {data.diagramName || 'Select Sub-Diagram'}
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>📥 {paramCount} param{paramCount !== 1 ? 's' : ''}</span>
          <span>📤 {returnCount} return{returnCount !== 1 ? 's' : ''}</span>
        </div>
        {data.diagramId && (
          <div className="text-xs text-gray-400 truncate">
            ID: {data.diagramId}
          </div>
        )}
      </div>
    </BaseBlock>
  );
}

export const SubDiagramCallBlock = memo(SubDiagramCallBlockComponent);
