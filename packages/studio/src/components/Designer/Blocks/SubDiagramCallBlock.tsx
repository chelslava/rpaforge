import { memo } from 'react';
import { NodeProps } from '@reactflow/core';

import { ProcessNodeData } from '../../../stores/processStore';
import { isSubDiagramCallBlock, BLOCK_COLORS } from '../../../types/blocks';
import { BaseBlock } from './BaseBlock';
import SubDiagramCallContent from '../SubDiagramCallBlock';

function SubDiagramCallBlockComponent({ data, selected }: NodeProps<ProcessNodeData>) {
  const blockData = data.blockData;
  if (!blockData || !isSubDiagramCallBlock(blockData)) return null;

  const colors = BLOCK_COLORS['sub-diagram'];

  return (
    <BaseBlock data={blockData} selected={selected}>
      <div style={{ color: colors.primary }}>
        <SubDiagramCallContent
          diagramId={blockData.diagramId}
          diagramName={blockData.diagramName || 'Select Sub-Diagram'}
          parameterMappings={blockData.parameters}
          outputMappings={blockData.returns}
        />
      </div>
    </BaseBlock>
  );
}

export const SubDiagramCallBlock = memo(SubDiagramCallBlockComponent);
