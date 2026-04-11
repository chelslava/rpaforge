/**
 * RPAForge Python Bridge
 *
 * Manages communication between Electron and Python engine
 * using JSON-RPC 2.0 protocol over stdin/stdout.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';
import {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCNotification,
  PendingRequest,
  RequestId,
} from '../src/types/ipc.js';
import { BridgeEvent, BridgeState, EventListener } from '../src/types/events.js';

const CONFIG = {
  maxReconnectAttempts: 3,
  reconnectDelayMs: 1000,
  startupTimeoutMs: 5000,
  heartbeatIntervalMs: 5000,
  requestTimeoutMs: 30000,
};

export type { BridgeState };

export class PythonBridge {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<RequestId, PendingRequest> = new Map();
  private buffer: string = '';
  private messageId = 0;
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private _state: BridgeState = 'stopped';
  private reconnectAttempts = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  get state(): BridgeState {
    return this._state;
  }

  private setState(newState: BridgeState, details?: { error?: string }): void {
    const previousState = this._state;
    if (previousState === newState) return;
    
    this._state = newState;
    this.emitBridgeStateEvent(newState, previousState, details);
  }

  private emitBridgeStateEvent(
    state: BridgeState, 
    previousState: BridgeState,
    details?: { error?: string }
  ): void {
    const event = {
      type: 'bridgeState' as const,
      timestamp: new Date().toISOString(),
      state,
      previousState,
      reconnectAttempt: state === 'reconnecting' ? this.reconnectAttempts : undefined,
      maxReconnectAttempts: CONFIG.maxReconnectAttempts,
      error: details?.error,
    };
    this.emitEvent('bridgeState', event as BridgeEvent);
  }

  async start(): Promise<void> {
    if (this._state === 'starting' || this._state === 'ready') {
      return;
    }

    this.setState('starting');
    this.reconnectAttempts = 0;

    const pythonPath = this.getPythonPath();
    const modulePath = 'rpaforge.bridge.server';

    console.log('[PythonBridge] Starting Python process...');
    console.log('[PythonBridge] Python:', pythonPath);
    console.log('[PythonBridge] Module:', modulePath);

    this.process = spawn(pythonPath, ['-m', modulePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      console.log('[PythonBridge] stdout:', str.trim());
      this.handleData(str);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      console.error('[PythonBridge] stderr:', message);
      if (message) {
        try {
          const parsed = JSON.parse(message);
          if (parsed.log) {
            console.log(`[Python ${parsed.log}]`, parsed.message);
          }
        } catch {
        }
      }
    });

    this.process.on('close', (code) => {
      console.log('[PythonBridge] Process closed with code:', code);
      this.handleProcessClose(code);
    });

    this.process.on('error', (err) => {
      console.error('[PythonBridge] Process error:', err);
      this.setState('stopped', { error: err.message });
      this.emitEvent('error', {
        type: 'error',
        timestamp: new Date().toISOString(),
        code: 0,
        message: err.message,
      } as BridgeEvent);
    });

    try {
      await this.waitForReady();
      this.startHeartbeat();
    } catch (err) {
      this.setState('stopped', { error: (err as Error).message });
      throw err;
    }
  }

  private handleProcessClose(code: number | null): void {
    this.stopHeartbeat();
    this.process = null;
    this.pendingRequests.clear();

    if (this._state === 'stopped') {
      return;
    }

    if (this.reconnectAttempts < CONFIG.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.setState('reconnecting');
      
      const delay = CONFIG.reconnectDelayMs * this.reconnectAttempts;
      console.log(
        `[PythonBridge] Reconnecting (attempt ${this.reconnectAttempts}/${CONFIG.maxReconnectAttempts}) in ${delay}ms...`
      );
      
      this.reconnectTimer = setTimeout(() => {
        this.start().catch((err) => {
          console.error('[PythonBridge] Reconnect failed:', err);
        });
      }, delay);
    } else {
      this.setState('stopped', { error: `Process exited with code ${code}. Max reconnect attempts reached.` });
    }
  }

  private async waitForReady(): Promise<void> {
    const maxWait = CONFIG.startupTimeoutMs;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (!this.process) {
        throw new Error('Process terminated during startup');
      }
      
      try {
        await this.sendRequest('ping', {});
        this.reconnectAttempts = 0;
        this.setState('ready');
        console.log('[PythonBridge] Connected to Python engine');
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    throw new Error('Python engine failed to start within timeout');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatInterval = setInterval(async () => {
      if (this._state !== 'ready' && this._state !== 'degraded') {
        return;
      }
      
      try {
        await this.sendRequest('ping', {});
        if (this._state === 'degraded') {
          this.setState('ready');
        }
      } catch {
        if (this._state === 'ready') {
          this.setState('degraded');
        }
      }
    }, CONFIG.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  stop(): void {
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.pendingRequests.clear();
    this.setState('stopped');
  }

  restart(): Promise<void> {
    this.stop();
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
    timeout = CONFIG.requestTimeoutMs
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

      const json = JSON.stringify(message) + '\n';
      this.process.stdin.write(json, 'utf8');
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip non-JSON lines (Robot Framework output, etc.)
      // JSON-RPC messages always start with '{'
      if (!trimmed.startsWith('{')) {
        // This is likely Robot Framework stdout output, ignore it
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed);

        if ('id' in parsed && parsed.id !== null) {
          this.handleResponse(parsed as JSONRPCResponse);
        } else if ('method' in parsed) {
          console.log('[PythonBridge] Parsed notification:', parsed.method, parsed);
          this.handleNotification(parsed as JSONRPCNotification);
        } else {
          console.log('[PythonBridge] Parsed unknown message:', parsed);
        }
      } catch (e) {
        // Only log parsing errors for lines that looked like JSON
        console.error('[PythonBridge] Failed to parse JSON:', trimmed, e);
      }
    }
  }

  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id as RequestId);

    if (pending) {
      this.pendingRequests.delete(response.id as RequestId);

      if (pending.timer) {
        clearTimeout(pending.timer);
      }

      if (response.error) {
        const error = new Error(response.error.message);
        (error as Error & { code: number }).code = response.error.code;
        pending.reject(error);
      } else {
        pending.resolve(response.result);
      }
    }
  }

  private handleNotification(notification: JSONRPCNotification): void {
    const params = notification.params as BridgeEvent | undefined;

    if (params && 'type' in params) {
      console.log('[PythonBridge] Notification:', params.type, params);
      this.emitEvent(params.type, params as BridgeEvent);
    }
  }

  onEvent(eventType: string, listener: EventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)!.add(listener);

    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  private emitEvent(eventType: string, event: BridgeEvent): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (e) {
          console.error(`[PythonBridge] Event listener error:`, e);
        }
      });
    }

    const allListeners = this.eventListeners.get('*');
    if (allListeners) {
      allListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (e) {
          console.error(`[PythonBridge] Event listener error:`, e);
        }
      });
    }
  }

  private getPythonPath(): string {
    if (process.env.PYTHON_PATH) {
      console.log('[PythonBridge] Using PYTHON_PATH from env:', process.env.PYTHON_PATH);
      return process.env.PYTHON_PATH;
    }

    const systemPython = process.platform === 'win32' ? 'python' : 'python3';
    console.log('[PythonBridge] Using Python path:', systemPython);
    return systemPython;
  }
}
