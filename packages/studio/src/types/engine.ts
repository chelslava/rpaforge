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
  keyword: string;
  file: string;
  line: number;
  args: unknown[];
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

export interface ActivityPort {
  id: string;
  type: 'flow' | 'data' | 'error';
  label: string;
  required: boolean;
}

export interface ActivityPorts {
  inputs: ActivityPort[];
  outputs: ActivityPort[];
}

export interface ActivityBuiltinSettings {
  timeout: boolean;
  retry: boolean;
  continueOnError: boolean;
  nested: boolean;
}

export interface ActivityRobotFrameworkMetadata {
  keyword: string;
  library: string;
}

export interface ActivityBridgePayload {
  id?: string;
  name: string;
  type?: ActivityType;
  category: string;
  description: string;
  icon?: string;
  ports?: Partial<ActivityPorts>;
  params?: ActivityParam[];
  builtin?: Partial<ActivityBuiltinSettings>;
  robotFramework?: Partial<ActivityRobotFrameworkMetadata>;
  tags?: string[];
}

export interface Activity extends ActivityBridgePayload {
  id: string;
  library: string;
  type: ActivityType;
  icon: string;
  ports: ActivityPorts;
  params: ActivityParam[];
  builtin: ActivityBuiltinSettings;
  robotFramework: ActivityRobotFrameworkMetadata;
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

const DEFAULT_PORTS: ActivityPorts = {
  inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
  outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
};

const DEFAULT_BUILTIN_SETTINGS: ActivityBuiltinSettings = {
  timeout: true,
  retry: false,
  continueOnError: false,
  nested: false,
};

const DEFAULT_ROBOT_FRAMEWORK_METADATA: ActivityRobotFrameworkMetadata = {
  keyword: '',
  library: 'BuiltIn',
};

function normalizeActivityPort(
  port: Partial<ActivityPort>,
  fallbackId: string
): ActivityPort {
  const type = port.type === 'data' || port.type === 'error' ? port.type : 'flow';

  return {
    id: port.id || fallbackId,
    type,
    label: port.label || port.id || fallbackId,
    required: port.required ?? true,
  };
}

function normalizeActivityPorts(ports?: Partial<ActivityPorts>): ActivityPorts {
  const inputs = ports?.inputs?.length
    ? ports.inputs.map((port, index) =>
        normalizeActivityPort(port, index === 0 ? 'input' : `input-${index + 1}`)
      )
    : DEFAULT_PORTS.inputs;
  const outputs = ports?.outputs?.length
    ? ports.outputs.map((port, index) =>
        normalizeActivityPort(port, index === 0 ? 'output' : `output-${index + 1}`)
      )
    : DEFAULT_PORTS.outputs;

  return { inputs, outputs };
}

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
  return rawLibrary.replace(/^RPAForge\./, '') || DEFAULT_ROBOT_FRAMEWORK_METADATA.library;
}

export function normalizeActivity(payload: ActivityBridgePayload): Activity {
  const robotFramework = {
    ...DEFAULT_ROBOT_FRAMEWORK_METADATA,
    ...payload.robotFramework,
  };

  const library = normalizeLibraryName(robotFramework.library);

  return {
    id:
      payload.id ||
      `${library}.${payload.name}`.replace(/\s+/g, '_').toLowerCase(),
    name: payload.name,
    type: payload.type || 'sync',
    category: payload.category || 'Other',
    description: payload.description || '',
    icon: payload.icon || '⚙',
    library,
    ports: normalizeActivityPorts(payload.ports),
    params: (payload.params || []).map(normalizeActivityParam),
    builtin: {
      ...DEFAULT_BUILTIN_SETTINGS,
      ...payload.builtin,
    },
    robotFramework,
    tags: payload.tags || [],
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
        type: 'sync',
        category: 'BuiltIn',
        description: 'Log a message',
        icon: '📝',
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
        builtin: {
          timeout: true,
          continueOnError: true,
        },
        robotFramework: {
          keyword: 'Log',
          library: 'BuiltIn',
        },
      },
      {
        id: 'builtin.set_variable',
        name: 'Set Variable',
        type: 'sync',
        category: 'BuiltIn',
        description: 'Assign a value to a Robot Framework variable.',
        icon: '📤',
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
        builtin: {
          timeout: true,
        },
        robotFramework: {
          keyword: 'Set Variable',
          library: 'BuiltIn',
        },
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
  return normalizeLibraryName(
    activity.robotFramework.library || activity.library || DEFAULT_ROBOT_FRAMEWORK_METADATA.library
  );
}
