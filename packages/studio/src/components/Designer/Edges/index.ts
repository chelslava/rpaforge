import { CustomEdge } from './CustomEdge';
import { SmoothstepEdge } from './SmoothstepEdge';
import { StepEdge } from './StepEdge';
import { AutoRouteEdge } from './AutoRouteEdge';
import type { EdgeTypes } from '@xyflow/react';

export { CustomEdge, SmoothstepEdge, StepEdge, AutoRouteEdge };

export const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
  smoothstep: SmoothstepEdge,
  step: StepEdge,
  'auto-route': AutoRouteEdge,
};
