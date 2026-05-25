/**
 * RPAForge IPC Contracts
 *
 * Fully typed API contracts for Electron IPC communication
 * between renderer (UI) and main process (Python bridge).
 */

import type { BridgeState, BridgeStatus, EventListener } from './events';
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

export interface BridgeAPI {
  /** Check if Python bridge process is ready to accept requests */
  isReady: () => Promise<boolean>;
  /** Get the current high-level bridge state */
  getState: () => Promise<BridgeState>;
  /** Get the full typed bridge runtime status */
  getStatus: () => Promise<BridgeStatus>;
  /** Send raw JSON-RPC request to Python bridge */
  send: (method: string, params: unknown) => Promise<unknown>;
  /** Subscribe to events from Python bridge */
  onEvent: (listener: EventListener) => () => void;
}

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

export interface EditorAPI {
  /** Format Python code using ruff */
  formatCode: (code: string) => Promise<{ formatted_code: string; changed: boolean }>;
  /** Validate Python code using ruff check */
  validateCode: (code: string) => Promise<{ errors: ValidationError[]; warnings: ValidationError[] }>;
}

export interface ValidationError {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
  properties?: ('openFile' | 'openDirectory' | 'multiSelections')[];
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface DialogAPI {
  /** Show open file/folder dialog */
  showOpenDialog: (options: OpenDialogOptions) => Promise<{ canceled: boolean; filePaths: string[] }>;
  /** Show save file dialog */
  showSaveDialog: (options: SaveDialogOptions) => Promise<{ canceled: boolean; filePath?: string }>;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  extension: string;
  size?: number;
  modifiedAt?: string;
}

import type { FsEvent } from './events';

export interface FileSystemAPI {
  setProjectRoot: (rootPath: string) => Promise<void>;
  pathExists: (path: string) => Promise<boolean>;
  readDir: (dirPath: string) => Promise<FileInfo[]>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  createDir: (dirPath: string) => Promise<void>;
  delete: (path: string, recursive?: boolean) => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  copy: (source: string, destination: string) => Promise<void>;
  openWithSystem: (filePath: string) => Promise<void>;
  showInFolder: (filePath: string) => Promise<void>;
  getFileInfo: (filePath: string) => Promise<FileInfo>;
  watchDir: (dirPath: string) => Promise<void>;
  unwatchDir: (dirPath: string) => Promise<void>;
  onFsEvent: (listener: (event: FsEvent) => void) => () => void;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  scope: string;
  message: string;
  details?: unknown;
  timestamp: string;
}

export interface LogAPI {
  log: (entry: Omit<LogEntry, 'timestamp'>) => void;
  getLogs: (filter?: { level?: string; scope?: string }) => Promise<LogEntry[]>;
  exportLogs: () => Promise<string>;
  clearLogs: () => void;
}

export interface StudioAPI {
  bridge: BridgeAPI;
  engine: EngineAPI;
  debugger: DebuggerAPI;
  editor: EditorAPI;
  dialog: DialogAPI;
  fs: FileSystemAPI;
  log: LogAPI;
  spy: SpyAPI;
}

export const IPC_CHANNELS = {
  BRIDGE_IS_READY: 'bridge:isReady',
  BRIDGE_GET_STATE: 'bridge:getState',
  BRIDGE_GET_STATUS: 'bridge:getStatus',
  BRIDGE_SEND: 'bridge:send',
  BRIDGE_EVENT: 'bridge:event',

  ENGINE_PING: 'engine:ping',
  ENGINE_GET_CAPABILITIES: 'engine:getCapabilities',
  ENGINE_RUN_PROCESS: 'engine:runProcess',
  ENGINE_RUN_FILE: 'engine:runFile',
  ENGINE_STOP_PROCESS: 'engine:stopProcess',
  ENGINE_PAUSE_PROCESS: 'engine:pauseProcess',
  ENGINE_RESUME_PROCESS: 'engine:resumeProcess',
  ENGINE_GET_ACTIVITIES: 'engine:getActivities',

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

  DIALOG_SHOW_OPEN: 'dialog:showOpen',
  DIALOG_SHOW_SAVE: 'dialog:showSave',

  EDITOR_FORMAT_CODE: 'editor:formatCode',
  EDITOR_VALIDATE_CODE: 'editor:validateCode',

  FS_SET_PROJECT_ROOT: 'fs:setProjectRoot',
  FS_PATH_EXISTS: 'fs:pathExists',
  FS_READ_DIR: 'fs:readDir',
  FS_READ_FILE: 'fs:readFile',
  FS_WRITE_FILE: 'fs:writeFile',
  FS_CREATE_DIR: 'fs:createDir',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_COPY: 'fs:copy',
  FS_OPEN_WITH_SYSTEM: 'fs:openWithSystem',
  FS_SHOW_IN_FOLDER: 'fs:showInFolder',
  FS_GET_FILE_INFO: 'fs:getFileInfo',
  FS_WATCH_DIR: 'fs:watchDir',
  FS_UNWATCH_DIR: 'fs:unwatchDir',
  FS_EVENT: 'fs:event',

  LOG_WRITE: 'log:write',
  LOG_GET: 'log:get',
  LOG_EXPORT: 'log:export',
  LOG_CLEAR: 'log:clear',
  SPY_START: 'spy_start',
  SPY_STOP: 'spy_stop',
  SPY_CAPTURE_WEB: 'spy:captureWeb',
  SPY_CAPTURE_DESKTOP: 'spy:captureDesktop',
} as const;

// Type for IPC channel names
export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

declare global {
  interface Window {
    rpaforge?: StudioAPI;
  }
}

export interface PageElement {
  tag: string;
  id: string | null;
  classes: string[];
  text: string | null;
  xpath: string;
  cssPath: string;
  reliableSelector: { type: string; value: string; reliability: number };
  rect: { x: number; y: number; width: number; height: number };
}

export interface SelectorTestResult {
  valid: boolean;
  unique: boolean;
  count: number;
  visible?: boolean;
  enabled?: boolean;
  warning?: string;
}

export interface XPathResult {
  xpath: string;
  css: string;
  tag: string;
  text: string;
}

export interface InspectPageOptions {
  includeFrames?: boolean;
}

export interface HighlightOptions {
  color?: string;
  duration?: number;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
}

export interface InspectorAPI {
  /** Inspect the current page DOM and extract interactive elements */
  inspectPage: (options?: InspectPageOptions) => Promise<PageElement[]>;
  /** Visually highlight an element on the page */
  highlightElement: (selector: string, options?: HighlightOptions) => Promise<void>;
  /** Test if a selector matches elements on the page */
  testSelector: (selector: string) => Promise<SelectorTestResult>;
  /** Get XPath/CSS selector for element at given coordinates */
  getXPathFromPoint: (x: number, y: number) => Promise<XPathResult>;
  /** Capture a screenshot of the current page */
  capturePageScreenshot: (options?: ScreenshotOptions) => Promise<string>;
}

export const INSPECTOR_CHANNELS = {
  INSPECT: 'inspector:inspect',
  HIGHLIGHT: 'inspector:highlight',
  TEST: 'inspector:test',
  POINT: 'inspector:point',
  SCREENSHOT: 'inspector:screenshot',
} as const;

export interface SpyAPI {
  startCapture: (mode: 'web' | 'desktop') => Promise<{ success: boolean }>;
  stopCapture: () => Promise<{ success: boolean }>;
  captureWebElement: (x: number, y: number) => Promise<PageElement>;
  captureDesktopElement: (x: number, y: number) => Promise<PageElement>;
  getMousePosition: () => Promise<{ x: number; y: number }>;
  getElementAtPosition: (x: number, y: number, mode: 'web' | 'desktop') => Promise<PageElement | null>;
}

export const SPY_CHANNELS = {
  CAPTURE_WEB: 'spy:captureWeb',
  CAPTURE_DESKTOP: 'spy:captureDesktop',
} as const;
