export { BaseBlock } from './BaseBlock';
export { StartBlock } from './StartBlock';
export { EndBlock } from './EndBlock';
export { IfBlock } from './IfBlock';
export { SwitchBlock } from './SwitchBlock';
export { WhileBlock } from './WhileBlock';
export { ForEachBlock } from './ForEachBlock';
export { ParallelBlock } from './ParallelBlock';
export { RetryScopeBlock } from './RetryScopeBlock';
export { TryCatchBlock } from './TryCatchBlock';
export { ThrowBlock } from './ThrowBlock';
export { AssignBlock } from './AssignBlock';
export { SubDiagramCallBlock } from './SubDiagramCallBlock';
export { ActivityBlock } from './ActivityBlock';
export { withBreakpoint, WithBreakpoint } from './withBreakpoint';

import { NodeTypes } from '@reactflow/core';
import { StartBlock } from './StartBlock';
import { EndBlock } from './EndBlock';
import { IfBlock } from './IfBlock';
import { SwitchBlock } from './SwitchBlock';
import { WhileBlock } from './WhileBlock';
import { ForEachBlock } from './ForEachBlock';
import { ParallelBlock } from './ParallelBlock';
import { RetryScopeBlock } from './RetryScopeBlock';
import { TryCatchBlock } from './TryCatchBlock';
import { ThrowBlock } from './ThrowBlock';
import { AssignBlock } from './AssignBlock';
import { SubDiagramCallBlock } from './SubDiagramCallBlock';
import { ActivityBlock } from './ActivityBlock';
import { withBreakpoint } from './withBreakpoint';

export const blockNodeTypes: NodeTypes = {
  start: withBreakpoint(StartBlock),
  end: withBreakpoint(EndBlock),
  if: withBreakpoint(IfBlock),
  switch: withBreakpoint(SwitchBlock),
  while: withBreakpoint(WhileBlock),
  'for-each': withBreakpoint(ForEachBlock),
  parallel: withBreakpoint(ParallelBlock),
  'retry-scope': withBreakpoint(RetryScopeBlock),
  'try-catch': withBreakpoint(TryCatchBlock),
  throw: withBreakpoint(ThrowBlock),
  assign: withBreakpoint(AssignBlock),
  'sub-diagram-call': withBreakpoint(SubDiagramCallBlock),
  activity: withBreakpoint(ActivityBlock),
};
