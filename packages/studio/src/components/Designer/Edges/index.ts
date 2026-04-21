import { CustomEdge } from './CustomEdge';
import { SmoothstepEdge } from './SmoothstepEdge';
import { BendableEdge } from './BendableEdge';
import type { EdgeTypes } from '@reactflow/core';

export { CustomEdge, SmoothstepEdge, BendableEdge };

export const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
  smoothstep: SmoothstepEdge,
  bendable: BendableEdge,
};
