/**
 * RPAForge Engine Types
 *
 * Types and normalization helpers for the Python bridge contract.
 */

import type { Activity, ActivityParamType } from '../domain/activity';
import { normalizeActivity, normalizeLibraryName as normalizeLibraryNameFromActivities } from '../domain/activity';

export interface RunProcessParams {
  source: string;
  name?: string;
}

export interface RunFileParams {
  path: string;
}

export interface SetBreakpointParams {
  file: string;
  line: number;
  condition?: string;
  hitCondition?: string;
}

export interface RemoveBreakpointParams {
  id: string;
}

export interface ToggleBreakpointParams {
  id: string;
}

export interface GetVariablesParams {
  scope?: string;
}

export interface RunProcessResult {
  processId: string;
  status: 'running' | 'pass' | 'fail';
  duration?: number;
}

export interface Breakpoint {
  id: string;
  file: string;
  line: number;
  nodeId?: string;
  condition?: string;
  hitCondition?: string;
  enabled: boolean;
}

export interface GetBreakpointsResult {
  breakpoints: Breakpoint[];
}

export interface Variable {
  name: string;
  value: unknown;
  type: string;
  children?: Variable[];
}

export interface GetVariablesResult {
  variables: Variable[];
}

export interface CallFrame {
  activity: string;
  library: string;
  line: number;
  nodeId: string;
}

export interface GetCallStackResult {
  callStack: CallFrame[];
}

export interface PingResult {
  pong: boolean;
  timestamp: number;
}

export interface Capabilities {
  version: string;
  features: {
    debugger: boolean;
    breakpoints: boolean;
    stepping: boolean;
    variableWatching: boolean;
  };
  libraries: string[];
}

export interface StepResult {
  stepped: boolean;
  mode?: 'over' | 'into' | 'out';
  error?: string;
}

export interface ContinueResult {
  continued: boolean;
  error?: string;
}

export interface StopResult {
  stopped: boolean;
}

export interface PauseResult {
  paused: boolean;
  error?: string;
}

export interface ResumeResult {
  resumed: boolean;
  error?: string;
}

export interface SubDiagramParam {
  name: string;
  label: string;
  type: ActivityParamType;
  required: boolean;
  defaultValue?: unknown;
}

export interface SubDiagramOutput {
  name: string;
  label: string;
  type: ActivityParamType;
}

export interface SubDiagramCallData {
  diagramId: string;
  diagramName: string;
  diagramPath: string;
  inputs: SubDiagramParam[];
  outputs: SubDiagramOutput[];
  parameterMappings: Record<string, string>;
  outputMappings: Record<string, string>;
}

export interface RemoveBreakpointResult {
  removed: boolean;
}

export interface ToggleBreakpointResult {
  id: string;
  enabled: boolean;
}

export interface GetActivitiesResult {
  activities: Activity[];
}

export function normalizeActivitiesResult(payload: unknown): GetActivitiesResult {
  const rawActivities = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && 'activities' in payload
      ? (payload as { activities?: unknown[] }).activities || []
      : [];

  const activities = rawActivities
    .filter(
      (item): item is { id?: string; name: string; library: string; type?: string; category: string; description: string; tags?: string[]; timeout_ms?: number; has_retry?: boolean; has_continue_on_error?: boolean; params?: unknown[] } =>
        typeof item === 'object' && item !== null && 'name' in item && 'library' in item && 'category' in item
    )
    .map((activity) => normalizeActivity(activity as Parameters<typeof normalizeActivity>[0]));
  
  return {
    activities,
  };
}

export function createActivityParamValues(
  activity: Activity
): Record<string, unknown> {
  return activity.params.reduce<Record<string, unknown>>((acc, param) => {
    if (param.variadic) {
      acc[param.name] = [''];
      return acc;
    }

    if (param.default !== undefined && param.default !== null) {
      acc[param.name] = param.default;
      return acc;
    }

    if (param.type === 'boolean') {
      acc[param.name] = false;
      return acc;
    }

    if (param.type === 'integer' || param.type === 'float') {
      acc[param.name] = 0;
      return acc;
    }

    acc[param.name] = '';
    return acc;
  }, {});
}

export function getActivityDefaultValues(activity: Activity): Record<string, unknown> {
  return createActivityParamValues(activity);
}

export function getActivityDisplayLibrary(activity: Activity): string {
  return normalizeLibraryNameFromActivities(activity.library);
}
