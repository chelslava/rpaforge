export { BaseBlock } from './BaseBlock';
export { StartBlock } from './StartBlock';
export { EndBlock } from './EndBlock';
export { IfBlock } from './IfBlock';
export { WhileBlock } from './WhileBlock';
export { ForEachBlock } from './ForEachBlock';
export { TryCatchBlock } from './TryCatchBlock';
export { AssignBlock } from './AssignBlock';
export { SubDiagramCallBlock } from './SubDiagramCallBlock';
export { ActivityBlock } from './ActivityBlock';

import { NodeTypes } from '@reactflow/core';
import { StartBlock } from './StartBlock';
import { EndBlock } from './EndBlock';
import { IfBlock } from './IfBlock';
import { WhileBlock } from './WhileBlock';
import { ForEachBlock } from './ForEachBlock';
import { TryCatchBlock } from './TryCatchBlock';
import { AssignBlock } from './AssignBlock';
import { SubDiagramCallBlock } from './SubDiagramCallBlock';
import { ActivityBlock } from './ActivityBlock';

export const blockNodeTypes: NodeTypes = {
  start: StartBlock,
  end: EndBlock,
  if: IfBlock,
  while: WhileBlock,
  'for-each': ForEachBlock,
  'try-catch': TryCatchBlock,
  assign: AssignBlock,
  'sub-diagram-call': SubDiagramCallBlock,
  activity: ActivityBlock,
};
