/**
 * RPAForge Engine Types
 *
 * Types for engine API requests and responses.
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
  status: 'pass' | 'fail';
  duration: number;
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

export interface ActivityArgument {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface Activity {
  id?: string;
  name: string;
  library: string;
  category: string;
  description: string;
  arguments: ActivityArgument[];
  icon?: string;
  tags?: string[];
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

export interface RemoveBreakpointResult {
  removed: boolean;
}

export interface ToggleBreakpointResult {
  id: string;
  enabled: boolean;
}
