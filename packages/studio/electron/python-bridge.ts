/**
 * RPAForge Python Bridge
 *
 * Manages communication between Electron and Python engine
 * using JSON-RPC 2.0 protocol over stdin/stdout.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import {
  type JSONRPCNotification,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type PendingRequest,
  type RequestId,
} from '../src/types/ipc';
import {
  type BridgeEvent,
  type BridgeState,
  type BridgeStateEvent,
  type BridgeStateReason,
  type BridgeStatus,
  type EventListener,
  type LogLevel,
} from '../src/types/events';
import { config } from '../src/config/app.config';
import { createLogger } from '../src/utils/logger';

export interface PythonBridgeConfig {
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  startupTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatFailureThreshold: number;
  requestTimeoutMs: number;
}

type BridgeStateDetails = {
  error?: string;
  reason?: BridgeStateReason;
  fatal?: boolean;
  clearError?: boolean;
  consecutiveHeartbeatFailures?: number;
};

const DEFAULT_CONFIG: PythonBridgeConfig = {
  maxReconnectAttempts: config.bridge.maxReconnectAttempts,
  reconnectDelayMs: config.bridge.reconnectDelayMs,
  startupTimeoutMs: config.bridge.startupTimeoutMs,
  heartbeatIntervalMs: config.bridge.heartbeatIntervalMs,
  heartbeatFailureThreshold: config.bridge.heartbeatFailureThreshold,
  requestTimeoutMs: config.bridge.requestTimeoutMs,
};

const STARTUP_PROBE_DELAY_MS = 100;
const DEFAULT_BRIDGE_ERROR_CODE = 0;
type SpawnProcess = typeof spawn;
const logger = createLogger('electron-python-bridge');

export class PythonBridge {
  private readonly config: PythonBridgeConfig;
  private process: ChildProcessWithoutNullStreams | null = null;
  private pendingRequests: Map<RequestId, PendingRequest> = new Map();
  private buffer = '';
  private messageId = 0;
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private startPromise: Promise<void> | null = null;
  private activeProcessGeneration = 0;
  private reconnectAttempts = 0;
  private consecutiveHeartbeatFailures = 0;
  private manualStop = false;
  private launchMode: 'initial' | 'reconnect' = 'initial';
  private _state: BridgeState = 'stopped';
  private previousState: BridgeState | undefined;
  private lastError: string | undefined;
  private lastReason: BridgeStateReason | undefined;
  private fatal = false;

  constructor(
    config: Partial<PythonBridgeConfig> = {},
    private readonly spawnChildProcess: SpawnProcess = spawn
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  get state(): BridgeState {
    return this._state;
  }

  getStatus(): BridgeStatus {
    return {
      timestamp: new Date().toISOString(),
      state: this._state,
      previousState: this.previousState,
      isOperational: this.isOperational(),
      reconnectAttempt:
        this.reconnectAttempts > 0 ? this.reconnectAttempts : undefined,
      maxReconnectAttempts: this.config.maxReconnectAttempts,
      consecutiveHeartbeatFailures: this.consecutiveHeartbeatFailures,
      error: this.lastError,
      reason: this.lastReason,
      fatal: this.fatal,
    };
  }

  async start(): Promise<void> {
    if (this.isOperational()) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.manualStop = false;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.launchMode = 'initial';

    this.startPromise = this.launchProcess().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  stop(): void {
    this.stopInternal('manual_stop');
  }

  restart(): Promise<void> {
    this.stopInternal('manual_restart');
    return this.start();
  }

  isReady(): boolean {
    return this._state === 'ready';
  }

  isOperational(): boolean {
    return this._state === 'ready' || this._state === 'degraded';
  }

  sendRequest<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeout = this.config.requestTimeoutMs
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error(`Python process not running (state: ${this._state})`));
        return;
      }

      if (this._state === 'stopped') {
        reject(new Error('Bridge is stopped'));
        return;
      }

      const id = ++this.messageId;
      const message: JSONRPCRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });

      this.process.stdin.write(`${JSON.stringify(message)}\n`, 'utf8');
    });
  }

  onEvent(eventType: string, listener: EventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    const listeners = this.eventListeners.get(eventType);
    if (listeners?.has(listener)) {
      return () => {
        listeners.delete(listener);
      };
    }

    listeners?.add(listener);

    return () => {
      listeners?.delete(listener);
    };
  }

  private async launchProcess(): Promise<void> {
    this.stopHeartbeat();
    this.buffer = '';
    this.consecutiveHeartbeatFailures = 0;

    this.setState('starting', {
      reason: 'startup',
      fatal: false,
      clearError: this.launchMode === 'initial',
      consecutiveHeartbeatFailures: 0,
    });

    const generation = this.spawnBridgeProcess();

    try {
      await this.waitForReady(generation);
      this.reconnectAttempts = 0;
      this.setState('ready', {
        reason: 'ready_check',
        fatal: false,
        clearError: true,
        consecutiveHeartbeatFailures: 0,
      });
      this.startHeartbeat();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start Python bridge';

      if (!this.manualStop && generation === this.activeProcessGeneration) {
        if (this.launchMode === 'reconnect') {
          this.scheduleReconnect('process_exit', message);
        } else {
          this.setState('stopped', {
            reason: 'startup',
            error: message,
            fatal: true,
          });
        }
      }

      throw error;
    }
  }

  private spawnBridgeProcess(): number {
    const generation = this.activeProcessGeneration + 1;
    this.activeProcessGeneration = generation;

    const pythonPath = this.getPythonPath();
    const child = this.spawnChildProcess(pythonPath, ['-m', 'rpaforge.bridge.server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    this.process = child;

    child.stdout.on('data', (data: Buffer) => {
      if (generation !== this.activeProcessGeneration) {
        return;
      }

      this.handleData(data.toString());
    });

    child.stderr.on('data', (data: Buffer) => {
      if (generation !== this.activeProcessGeneration) {
        return;
      }

      const messages = data
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      messages.forEach((message) => this.handleStderrLine(message));
    });

    child.on('close', (code) => {
      if (generation !== this.activeProcessGeneration) {
        return;
      }

      const message =
        code === null
          ? 'Python bridge process closed'
          : `Python bridge process exited with code ${code}`;
      this.handleProcessTermination('process_exit', message);
    });

    child.on('error', (error) => {
      if (generation !== this.activeProcessGeneration) {
        return;
      }

      this.emitEvent('error', {
        type: 'error',
        timestamp: new Date().toISOString(),
        code: DEFAULT_BRIDGE_ERROR_CODE,
        message: error.message,
      } as BridgeEvent);
      this.handleProcessTermination('process_error', error.message);
    });

    return generation;
  }

  private handleStderrLine(message: string): void {
    try {
      const parsed = JSON.parse(message) as { log?: string; message?: string };
      if (parsed.log && parsed.message) {
        this.emitEvent('log', {
          type: 'log',
          timestamp: new Date().toISOString(),
          level: this.normalizeLogLevel(parsed.log),
          message: parsed.message,
          source: 'python-bridge',
        } as BridgeEvent);
        return;
      }
    } catch {
      // Non-JSON stderr is still surfaced as a structured log event below.
    }

    this.emitEvent('log', {
      type: 'log',
      timestamp: new Date().toISOString(),
      level: 'warn',
      message,
      source: 'python-bridge',
    } as BridgeEvent);
  }

  private normalizeLogLevel(level: string): LogLevel {
    switch (level) {
      case 'trace':
      case 'debug':
      case 'info':
      case 'warn':
      case 'error':
        return level;
      default:
        return 'info';
    }
  }

  private async waitForReady(generation: number): Promise<void> {
    const deadline = Date.now() + this.config.startupTimeoutMs;
    const probeTimeout = Math.min(500, this.config.startupTimeoutMs);

    while (Date.now() < deadline) {
      if (generation !== this.activeProcessGeneration || !this.process) {
        throw new Error('Process terminated during startup');
      }

      try {
        await this.sendRequest('ping', {}, probeTimeout);
        return;
      } catch {
        await this.delay(STARTUP_PROBE_DELAY_MS);
      }
    }

    throw new Error('Python engine failed to start within timeout');
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      void this.runHeartbeat();
    }, this.config.heartbeatIntervalMs);
  }

  private async runHeartbeat(): Promise<void> {
    if (!this.process || !this.isOperational()) {
      return;
    }

    try {
      await this.sendRequest(
        'ping',
        {},
        Math.min(this.config.heartbeatIntervalMs, this.config.requestTimeoutMs)
      );

      if (this.consecutiveHeartbeatFailures > 0 || this._state === 'degraded') {
        this.setState('ready', {
          reason: 'heartbeat',
          fatal: false,
          clearError: true,
          consecutiveHeartbeatFailures: 0,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Heartbeat failure';
      const failureCount = this.consecutiveHeartbeatFailures + 1;

      this.setState('degraded', {
        reason: 'heartbeat',
        error: message,
        fatal: false,
        consecutiveHeartbeatFailures: failureCount,
      });

      if (failureCount >= this.config.heartbeatFailureThreshold) {
        this.forceReconnectFromHeartbeat(message);
      }
    }
  }

  private forceReconnectFromHeartbeat(message: string): void {
    this.stopHeartbeat();
    this.rejectPendingRequests(`Bridge heartbeat failed: ${message}`);

    const process = this.process;
    this.process = null;
    this.activeProcessGeneration = 0;

    if (process) {
      process.kill();
    }

    this.scheduleReconnect('heartbeat', message);
  }

  private handleProcessTermination(
    reason: BridgeStateReason,
    message: string
  ): void {
    this.stopHeartbeat();
    this.buffer = '';
    this.process = null;
    this.activeProcessGeneration = 0;
    this.rejectPendingRequests(message);

    if (this.manualStop) {
      return;
    }

    if (this._state === 'starting') {
      if (this.launchMode === 'reconnect') {
        this.scheduleReconnect(reason, message);
      } else {
        this.setState('stopped', {
          reason: 'startup',
          error: message,
          fatal: true,
        });
      }
      return;
    }

    if (
      this._state === 'ready' ||
      this._state === 'degraded' ||
      this._state === 'reconnecting'
    ) {
      this.scheduleReconnect(reason, message);
      return;
    }

    this.setState('stopped', {
      reason,
      error: message,
      fatal: false,
    });
  }

  private scheduleReconnect(reason: BridgeStateReason, error?: string): void {
    if (this.manualStop) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState('stopped', {
        reason: 'reconnect_exhausted',
        error:
          error ??
          'Python bridge stopped after exhausting reconnect attempts',
        fatal: true,
      });
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempts += 1;

    this.setState('reconnecting', {
      reason,
      error,
      fatal: false,
    });

    const delayMs = this.config.reconnectDelayMs * this.reconnectAttempts;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.launchMode = 'reconnect';

      if (!this.startPromise) {
        this.startPromise = this.launchProcess()
          .catch(() => undefined)
          .finally(() => {
            this.startPromise = null;
          });
      }
    }, delayMs);
  }

  private stopInternal(reason: BridgeStateReason): void {
    this.manualStop = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.rejectPendingRequests('Bridge stopped');

    const process = this.process;
    this.process = null;
    this.activeProcessGeneration = 0;

    if (process) {
      process.kill();
    }

    this.setState('stopped', {
      reason,
      fatal: false,
      clearError: true,
      consecutiveHeartbeatFailures: 0,
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private rejectPendingRequests(message: string): void {
    this.pendingRequests.forEach((pending) => {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.reject(new Error(message));
    });
    this.pendingRequests.clear();
  }

  private setState(newState: BridgeState, details: BridgeStateDetails = {}): void {
    const previousState = this._state;
    const nextError = details.clearError
      ? undefined
      : details.error !== undefined
        ? details.error
        : this.lastError;
    const nextReason = details.reason ?? this.lastReason;
    const nextFatal =
      details.fatal !== undefined
        ? details.fatal
        : newState === 'ready'
          ? false
          : this.fatal;
    const nextHeartbeatFailures =
      details.consecutiveHeartbeatFailures ?? this.consecutiveHeartbeatFailures;

    const changed =
      previousState !== newState ||
      nextError !== this.lastError ||
      nextReason !== this.lastReason ||
      nextFatal !== this.fatal ||
      nextHeartbeatFailures !== this.consecutiveHeartbeatFailures;

    this._state = newState;
    this.previousState = previousState === newState ? this.previousState : previousState;
    this.lastError = nextError;
    this.lastReason = nextReason;
    this.fatal = nextFatal;
    this.consecutiveHeartbeatFailures = nextHeartbeatFailures;

    if (!changed) {
      return;
    }

    const event: BridgeStateEvent = {
      type: 'bridgeState',
      ...this.getStatus(),
      previousState,
    };

    this.emitEvent('bridgeState', event as BridgeEvent);
  }

  private handleData(data: string): void {
    this.buffer += data;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('{')) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed);

        if ('id' in parsed && parsed.id !== null) {
          this.handleResponse(parsed as JSONRPCResponse);
        } else if ('method' in parsed) {
          this.handleNotification(parsed as JSONRPCNotification);
        }
      } catch (error) {
        this.emitEvent('log', {
          type: 'log',
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: `Failed to parse bridge JSON: ${trimmed}`,
          source: error instanceof Error ? error.message : 'python-bridge',
        } as BridgeEvent);
      }
    }
  }

  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id as RequestId);

    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id as RequestId);

    if (pending.timer) {
      clearTimeout(pending.timer);
    }

    if (response.error) {
      const error = new Error(response.error.message);
      (error as Error & { code: number }).code = response.error.code;
      pending.reject(error);
      return;
    }

    pending.resolve(response.result);
  }

  private handleNotification(notification: JSONRPCNotification): void {
    const params = notification.params as BridgeEvent | undefined;

    if (params && 'type' in params) {
      this.emitEvent(params.type, params as BridgeEvent);
    }
  }

  private emitEvent(eventType: string, event: BridgeEvent): void {
    const listeners = this.eventListeners.get(eventType);
    listeners?.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        // Event listener failures must not break bridge lifecycle handling.
        logger.error('Event listener error', error);
      }
    });

    const allListeners = this.eventListeners.get('*');
    allListeners?.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        logger.error('Event listener error', error);
      }
    });
  }

  private getPythonPath(): string {
    return process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
  }
}
