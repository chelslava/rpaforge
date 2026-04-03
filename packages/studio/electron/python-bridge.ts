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
import { BridgeEvent, EventListener } from '../src/types/events.js';

export class PythonBridge {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<RequestId, PendingRequest> = new Map();
  private buffer: string = '';
  private messageId = 0;
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    const pythonPath = this.getPythonPath();
    const modulePath = 'rpaforge.bridge.server';

    this.process = spawn(pythonPath, ['-m', modulePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      if (message) {
        try {
          const parsed = JSON.parse(message);
          if (parsed.log) {
            console.log(`[Python ${parsed.log}]`, parsed.message);
          }
        } catch {
          console.error('[Python stderr]', message);
        }
      }
    });

    this.process.on('close', (code) => {
      console.log('[PythonBridge] Process closed:', code);
      this.isConnected = false;
      this.process = null;
      this.emitInternalEvent('disconnected', { code });

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(
          `[PythonBridge] Reconnecting (attempt ${this.reconnectAttempts})...`
        );
        setTimeout(() => this.start(), 1000 * this.reconnectAttempts);
      }
    });

    this.process.on('error', (err) => {
      console.error('[PythonBridge] Process error:', err);
      this.emitInternalEvent('error', { error: err.message });
    });

    await this.waitForReady();
    this.startHeartbeat();
  }

  private async waitForReady(): Promise<void> {
    const maxWait = 5000;
    const startTime = Date.now();

    while (!this.isConnected && Date.now() - startTime < maxWait) {
      try {
        await this.sendRequest('ping', {});
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('[PythonBridge] Connected to Python engine');
        this.emitInternalEvent('connected', {});
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    throw new Error('Python engine failed to start within timeout');
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.isConnected) {
        try {
          await this.sendRequest('ping', {});
        } catch {
          console.warn('[PythonBridge] Heartbeat failed');
          this.isConnected = false;
        }
      }
    }, 5000);
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.isConnected = false;
    this.pendingRequests.clear();
  }

  restart(): Promise<void> {
    this.stop();
    return this.start();
  }

  isReady(): boolean {
    return this.isConnected && this.process !== null;
  }

  sendRequest<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeout = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Python process not running'));
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
      this.process.stdin.write(json);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const parsed = JSON.parse(line);

        if ('id' in parsed && parsed.id !== null) {
          this.handleResponse(parsed as JSONRPCResponse);
        } else if ('method' in parsed) {
          this.handleNotification(parsed as JSONRPCNotification);
        }
      } catch (e) {
        console.error('[PythonBridge] Failed to parse:', line, e);
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

  private emitInternalEvent(
    event: 'connected' | 'disconnected' | 'error',
    data: unknown
  ): void {
    console.log(`[PythonBridge] Internal event: ${event}`, data);
  }

  private getPythonPath(): string {
    const venvPath = path.join(app.getAppPath(), '..', '..', '.venv', 'bin', 'python');

    if (process.platform === 'win32') {
      return 'python';
    }

    return venvPath;
  }
}
