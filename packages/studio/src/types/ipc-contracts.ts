/**
 * RPAForge IPC Contracts
 *
 * Fully typed API contracts for Electron IPC communication
 * between renderer (UI) and main process (Python bridge).
 */

import type { EventListener } from './events';
import type {
  PingResult,
  Capabilities,
  RunProcessResult,
  StopResult,
  PauseResult,
  ResumeResult,
  GetActivitiesResult,
  Breakpoint,
  GetBreakpointsResult,
  GetVariablesResult,
  GetCallStackResult,
  StepResult,
  ContinueResult,
  RemoveBreakpointResult,
  ToggleBreakpointResult,
} from './engine';

// =============================================================================
// Bridge API (low-level JSON-RPC)
// =============================================================================

export interface BridgeAPI {
  /** Check if Python bridge process is ready to accept requests */
  isReady: () => Promise<boolean>;
  /** Send raw JSON-RPC request to Python bridge */
  send: (method: string, params: unknown) => Promise<unknown>;
  /** Subscribe to events from Python bridge */
  onEvent: (listener: EventListener) => () => void;
}

// =============================================================================
// Engine API (high-level process execution)
// =============================================================================

export interface EngineAPI {
  /** Ping the engine to check connectivity */
  ping: () => Promise<PingResult>;
  /** Get engine capabilities and supported features */
  getCapabilities: () => Promise<Capabilities>;
  /** Run Robot Framework source code with optional sourcemap for debugging */
  runProcess: (source: string, name?: string, sourcemap?: Record<number, string>) => Promise<RunProcessResult>;
  /** Run a Robot Framework file from disk */
  runFile: (path: string) => Promise<RunProcessResult>;
  /** Stop the currently running process */
  stopProcess: () => Promise<StopResult>;
  /** Pause the currently running process */
  pauseProcess: () => Promise<PauseResult>;
  /** Resume a paused process */
  resumeProcess: () => Promise<ResumeResult>;
  /** Get available activities/keywords from all loaded libraries */
  getActivities: () => Promise<GetActivitiesResult>;
}

// =============================================================================
// Debugger API (breakpoints and stepping)
// =============================================================================

export interface DebuggerAPI {
  /** Set a breakpoint at file:line with optional condition */
  setBreakpoint: (
    file: string,
    line: number,
    condition?: string
  ) => Promise<Breakpoint>;
  /** Remove a breakpoint by ID */
  removeBreakpoint: (id: string) => Promise<RemoveBreakpointResult>;
  /** Toggle a breakpoint enabled/disabled state */
  toggleBreakpoint: (id: string) => Promise<ToggleBreakpointResult>;
  /** Get all breakpoints */
  getBreakpoints: () => Promise<GetBreakpointsResult>;
  /** Step over the current keyword */
  stepOver: () => Promise<StepResult>;
  /** Step into the current keyword */
  stepInto: () => Promise<StepResult>;
  /** Step out of the current keyword */
  stepOut: () => Promise<StepResult>;
  /** Continue execution until next breakpoint or end */
  continue: () => Promise<ContinueResult>;
  /** Get current variable values in scope */
  getVariables: () => Promise<GetVariablesResult>;
  /** Get current call stack */
  getCallStack: () => Promise<GetCallStackResult>;
}

// =============================================================================
// Combined Studio API (exposed via contextBridge)
// =============================================================================

export interface StudioAPI {
  bridge: BridgeAPI;
  engine: EngineAPI;
  debugger: DebuggerAPI;
}

// =============================================================================
// IPC Channel Names (for type-safe handler registration)
// =============================================================================

export const IPC_CHANNELS = {
  // Bridge channels
  BRIDGE_IS_READY: 'bridge:isReady',
  BRIDGE_SEND: 'bridge:send',
  BRIDGE_EVENT: 'bridge:event',

  // Engine channels
  ENGINE_PING: 'engine:ping',
  ENGINE_GET_CAPABILITIES: 'engine:getCapabilities',
  ENGINE_RUN_PROCESS: 'engine:runProcess',
  ENGINE_RUN_FILE: 'engine:runFile',
  ENGINE_STOP_PROCESS: 'engine:stopProcess',
  ENGINE_PAUSE_PROCESS: 'engine:pauseProcess',
  ENGINE_RESUME_PROCESS: 'engine:resumeProcess',
  ENGINE_GET_ACTIVITIES: 'engine:getActivities',

  // Debugger channels
  DEBUGGER_SET_BREAKPOINT: 'debugger:setBreakpoint',
  DEBUGGER_REMOVE_BREAKPOINT: 'debugger:removeBreakpoint',
  DEBUGGER_TOGGLE_BREAKPOINT: 'debugger:toggleBreakpoint',
  DEBUGGER_GET_BREAKPOINTS: 'debugger:getBreakpoints',
  DEBUGGER_STEP_OVER: 'debugger:stepOver',
  DEBUGGER_STEP_INTO: 'debugger:stepInto',
  DEBUGGER_STEP_OUT: 'debugger:stepOut',
  DEBUGGER_CONTINUE: 'debugger:continue',
  DEBUGGER_GET_VARIABLES: 'debugger:getVariables',
  DEBUGGER_GET_CALL_STACK: 'debugger:getCallStack',
} as const;

// Type for IPC channel names
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// =============================================================================
// Augment global Window interface
// =============================================================================

declare global {
  interface Window {
    rpaforge?: StudioAPI;
  }
}
