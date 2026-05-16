/**
 * RPAForge Event Types
 *
 * Types for events emitted from Python engine to UI.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export type BridgeState = 
  | 'starting'     
  | 'ready'        
  | 'degraded'     
  | 'reconnecting' 
  | 'stopped';     

export type BridgeStateReason =
  | 'startup'
  | 'ready_check'
  | 'heartbeat'
  | 'process_exit'
  | 'process_error'
  | 'manual_stop'
  | 'manual_restart'
  | 'reconnect_exhausted';

export interface BridgeStatus {
  timestamp: string;
  state: BridgeState;
  previousState?: BridgeState;
  isOperational: boolean;
  reconnectAttempt?: number;
  maxReconnectAttempts: number;
  consecutiveHeartbeatFailures: number;
  error?: string;
  reason?: BridgeStateReason;
  fatal?: boolean;
  lastPingTime?: number;
  averageResponseTimeMs?: number;
}

export interface BridgeStateEvent extends BridgeStatus {
  type: 'bridgeState';
}

export interface LogEvent {
  type: 'log';
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;
  runId?: string;
}

export interface BreakpointHitEvent {
  type: 'breakpointHit';
  timestamp: string;
  breakpointId: string;
  file: string;
  line: number;
  condition?: string;
}

export interface ProcessStartedEvent {
  type: 'processStarted';
  timestamp: string;
  processId: string;
  name: string;
}

export interface ProcessFinishedEvent {
  type: 'processFinished';
  timestamp: string;
  status: 'pass' | 'fail';
  duration: number;
  message?: string;
}

export interface ProcessStoppedEvent {
  type: 'processStopped';
  timestamp: string;
  reason: 'user' | 'error' | 'timeout';
}

export interface ProcessPausedEvent {
  type: 'processPaused';
  timestamp: string;
  file?: string;
  line?: number;
}

export interface ProcessResumedEvent {
  type: 'processResumed';
  timestamp: string;
}

export interface VariablesChangedEvent {
  type: 'variablesChanged';
  timestamp: string;
  variables: Array<{
    name: string;
    value: unknown;
    type: string;
  }>;
}

export interface CallStackChangedEvent {
  type: 'callStackChanged';
  timestamp: string;
  callStack: Array<{
    keyword: string;
    file: string;
    line: number;
    args: unknown[];
  }>;
}

export interface KeywordStartedEvent {
  type: 'keywordStarted';
  timestamp: string;
  name: string;
  file: string;
  line: number;
  args: unknown[];
}

export interface KeywordFinishedEvent {
  type: 'keywordFinished';
  timestamp: string;
  name: string;
  status: 'pass' | 'fail';
  result?: unknown;
}

export interface ErrorEvent {
  type: 'error';
  timestamp: string;
  code: number;
  message: string;
  details?: string;
}

export interface SpyElementCapturedEvent {
  type: 'spy:elementCaptured';
  timestamp: string;
  element: PickedElement;
  mode: 'web' | 'desktop';
}

export interface SpyModeChangedEvent {
  type: 'spy:modeChanged';
  timestamp: string;
  active: boolean;
  mode?: 'web' | 'desktop';
}

export interface PickedElement {
  tag: string;
  id: string | null;
  classes: string[];
  text: string | null;
  xpath: string;
  cssPath: string;
  reliableSelector?: {
    type: string;
    value: string;
    reliability: number;
  };
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type BridgeEvent =
  | BridgeStateEvent
  | LogEvent
  | BreakpointHitEvent
  | ProcessStartedEvent
  | ProcessFinishedEvent
  | ProcessStoppedEvent
  | ProcessPausedEvent
  | ProcessResumedEvent
  | VariablesChangedEvent
  | CallStackChangedEvent
  | KeywordStartedEvent
  | KeywordFinishedEvent
  | ErrorEvent
  | SpyElementCapturedEvent
  | SpyModeChangedEvent;

export type BridgeEventType = BridgeEvent['type'];

export type EventListener<T extends BridgeEvent = BridgeEvent> = (
  event: T
) => void;

export interface FsEvent {
  type: 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';
  path: string;
}

export type FileSystemEvent = FsEvent;
