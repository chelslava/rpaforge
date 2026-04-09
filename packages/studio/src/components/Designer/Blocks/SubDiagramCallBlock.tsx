import { memo } from 'react';
import { NodeProps } from '@reactflow/core';

import { ProcessNodeData } from '../../../stores/processStore';
import { isSubDiagramCallBlock, BLOCK_COLORS } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';

function SubDiagramCallBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || !isSubDiagramCallBlock(blockData)) return null;

  const colors = BLOCK_COLORS['sub-diagram'];
  const diagramName = blockData.diagramName || 'Select Sub-Diagram';
  const parameters = blockData.parameters || {};
  const returns = blockData.returns || {};
  const paramCount = Object.keys(parameters).length;
  const returnCount = Object.keys(returns).length;

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div className="space-y-1">
        <div className="font-medium text-sm" style={{ color: colors.primary }}>
          {diagramName}
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>📥 {paramCount} param{paramCount !== 1 ? 's' : ''}</span>
          <span>📤 {returnCount} return{returnCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </BaseBlock>
  );
}

export const SubDiagramCallBlock = memo(SubDiagramCallBlockComponent);
