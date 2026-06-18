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

import { NodeTypes } from '@xyflow/react';
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

// Create wrapped components once at module level to prevent recreation
const StartBlockWithBreakpoint = withBreakpoint(StartBlock);
const EndBlockWithBreakpoint = withBreakpoint(EndBlock);
const IfBlockWithBreakpoint = withBreakpoint(IfBlock);
const SwitchBlockWithBreakpoint = withBreakpoint(SwitchBlock);
const WhileBlockWithBreakpoint = withBreakpoint(WhileBlock);
const ForEachBlockWithBreakpoint = withBreakpoint(ForEachBlock);
const ParallelBlockWithBreakpoint = withBreakpoint(ParallelBlock);
const RetryScopeBlockWithBreakpoint = withBreakpoint(RetryScopeBlock);
const TryCatchBlockWithBreakpoint = withBreakpoint(TryCatchBlock);
const ThrowBlockWithBreakpoint = withBreakpoint(ThrowBlock);
const AssignBlockWithBreakpoint = withBreakpoint(AssignBlock);
const SubDiagramCallBlockWithBreakpoint = withBreakpoint(SubDiagramCallBlock);
const ActivityBlockWithBreakpoint = withBreakpoint(ActivityBlock);

export const blockNodeTypes: NodeTypes = {
  start: StartBlockWithBreakpoint,
  end: EndBlockWithBreakpoint,
  if: IfBlockWithBreakpoint,
  switch: SwitchBlockWithBreakpoint,
  while: WhileBlockWithBreakpoint,
  'for-each': ForEachBlockWithBreakpoint,
  parallel: ParallelBlockWithBreakpoint,
  'retry-scope': RetryScopeBlockWithBreakpoint,
  'try-catch': TryCatchBlockWithBreakpoint,
  throw: ThrowBlockWithBreakpoint,
  assign: AssignBlockWithBreakpoint,
  'sub-diagram-call': SubDiagramCallBlockWithBreakpoint,
  activity: ActivityBlockWithBreakpoint,
};
