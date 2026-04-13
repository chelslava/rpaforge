/**
 * RPAForge Engine Types
 *
 * Types and normalization helpers for the Python bridge contract.
 */

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

export type ActivityType =
  | 'sync'
  | 'condition'
  | 'loop'
  | 'container'
  | 'async'
  | 'error_handler'
  | 'code'
  | 'sub_diagram';

export type ActivityParamType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'variable'
  | 'expression'
  | 'secret'
  | 'code'
  | 'list'
  | 'dict';

export interface ActivityParam {
  name: string;
  type: ActivityParamType;
  label: string;
  description: string;
  required: boolean;
  default?: unknown;
  options: string[];
}

export interface ActivityBuiltinSettings {
  timeout_ms: number;
  has_retry: boolean;
  has_continue_on_error: boolean;
}

export interface ActivityBridgePayload {
  id?: string;
  name: string;
  library: string;
  type?: string;
  category: string;
  description: string;
  tags?: string[];
  timeout_ms?: number;
  has_retry?: boolean;
  has_continue_on_error?: boolean;
  params?: ActivityParam[];
}

export interface Activity {
  id: string;
  name: string;
  library: string;
  type: ActivityType;
  category: string;
  description: string;
  tags: string[];
  timeout_ms: number;
  has_retry: boolean;
  has_continue_on_error: boolean;
  params: ActivityParam[];
}

export interface GetActivitiesResult {
  activities: Activity[];
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

const DEFAULT_BUILTIN_SETTINGS: ActivityBuiltinSettings = {
  timeout_ms: 30000,
  has_retry: false,
  has_continue_on_error: false,
};

function normalizeActivityParam(param: Partial<ActivityParam>): ActivityParam {
  return {
    name: param.name || '',
    type: (param.type || 'string') as ActivityParamType,
    label: param.label || param.name || '',
    description: param.description || '',
    required: param.required ?? true,
    default: param.default,
    options: param.options || [],
  };
}

export function normalizeLibraryName(rawLibrary: string): string {
  if (!rawLibrary) return 'BuiltIn';
  return rawLibrary.replace(/^RPAForge\./, '').replace(/^rpaforge_libraries\./, '');
}

export function normalizeActivity(payload: ActivityBridgePayload): Activity {
  return {
    id: payload.id || `${payload.library}.${payload.name}`.replace(/\s+/g, '_').toLowerCase(),
    name: payload.name,
    library: normalizeLibraryName(payload.library),
    type: (payload.type as ActivityType) || 'sync',
    category: payload.category || 'Other',
    description: payload.description || '',
    tags: payload.tags || [],
    timeout_ms: payload.timeout_ms ?? DEFAULT_BUILTIN_SETTINGS.timeout_ms,
    has_retry: payload.has_retry ?? DEFAULT_BUILTIN_SETTINGS.has_retry,
    has_continue_on_error: payload.has_continue_on_error ?? DEFAULT_BUILTIN_SETTINGS.has_continue_on_error,
    params: (payload.params || []).map(normalizeActivityParam),
  };
}

export function normalizeActivitiesResult(payload: unknown): GetActivitiesResult {
  const rawActivities = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null && 'activities' in payload
      ? (payload as { activities?: unknown[] }).activities || []
      : [];

  return {
    activities: rawActivities
      .filter(
        (item): item is ActivityBridgePayload =>
          typeof item === 'object' && item !== null
      )
      .map(normalizeActivity),
  };
}

export function createFallbackActivities(): Activity[] {
  return normalizeActivitiesResult({
    activities: [
      {
        id: 'builtin.log',
        name: 'Log',
        library: 'BuiltIn',
        type: 'sync',
        category: 'BuiltIn',
        description: 'Log a message to the console.',
        tags: ['logging', 'debug'],
        timeout_ms: 30000,
        has_retry: false,
        has_continue_on_error: true,
        params: [
          {
            name: 'message',
            type: 'string',
            label: 'Message',
            description: 'Message to write to the log.',
            required: true,
            options: [],
          },
        ],
      },
      {
        id: 'builtin.set_variable',
        name: 'Set Variable',
        library: 'BuiltIn',
        type: 'sync',
        category: 'BuiltIn',
        description: 'Assign a value to a variable.',
        tags: ['variables'],
        timeout_ms: 30000,
        has_retry: false,
        has_continue_on_error: false,
        params: [
          {
            name: 'variable',
            type: 'variable',
            label: 'Variable',
            description: 'Variable name to set.',
            required: true,
            options: [],
          },
          {
            name: 'value',
            type: 'string',
            label: 'Value',
            description: 'Value to assign.',
            required: true,
            options: [],
          },
        ],
      },
    ],
  }).activities;
}

export function createActivityParamValues(
  activity: Activity
): Record<string, unknown> {
  return activity.params.reduce<Record<string, unknown>>((acc, param) => {
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
  return normalizeLibraryName(activity.library);
}
