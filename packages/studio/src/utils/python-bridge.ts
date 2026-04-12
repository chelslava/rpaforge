/**
 * RPAForge Python Bridge Client
 *
 * Works in both Electron and browser environments.
 * In Electron: uses IPC via window.rpaforge API
 * In browser: uses mock for development
 */

import type {
  BridgeEvent,
  BridgeState,
  BridgeStatus,
} from '../types/events';
import { createBridgeAdapter } from '../bridge/factory';
import type { BridgeAdapter } from '../bridge/types';
import { createLogger } from './logger';

type ClientBridgeEvent =
  | BridgeEvent
  | {
      type: 'connected';
      timestamp: string;
      transport: 'electron' | 'mock';
      state: BridgeState;
    }
  | {
      type: 'disconnected';
      timestamp: string;
      transport: 'electron' | 'mock';
      state: BridgeState;
    };

type ClientEventListener = (event: ClientBridgeEvent) => void;

const logger = createLogger('python-bridge-client');

export class PythonBridge {
  private eventListeners: Map<string, Set<ClientEventListener>> = new Map();
  private isConnected = false;
  private bridgeState: BridgeState = 'stopped';
  private readonly adapter: BridgeAdapter;

  constructor(adapter: BridgeAdapter = createBridgeAdapter()) {
    this.adapter = adapter;
  }

  async start(): Promise<void> {
    const status = await this.adapter.start((event) => {
      if ('type' in event) {
        if (event.type === 'bridgeState') {
          this.applyBridgeStatus(event);
        }
        this.emitEvent(event.type, event);
      }
    });

    this.applyBridgeStatus(status);
    this.emitEvent('bridgeState', {
      type: 'bridgeState',
      ...status,
    });
  }

  stop(): void {
    this.adapter.stop();

    if (this.isConnected) {
      this.emitEvent('disconnected', {
        type: 'disconnected',
        timestamp: new Date().toISOString(),
        transport: this.adapter.transport,
        state: this.bridgeState,
      });
    }

    this.isConnected = false;
    this.bridgeState = 'stopped';
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async checkReady(): Promise<boolean> {
    const status = await this.adapter.checkReady();
    this.applyBridgeStatus(status);
    return status.isOperational;
  }

  async sendRequest<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeout?: number
  ): Promise<T> {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }

    return this.adapter.send<T>(method, params, timeout);
  }

  onEvent(eventType: string, listener: ClientEventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)?.add(listener);

    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  private emitEvent(eventType: string, event: unknown): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event as never);
        } catch (e) {
          logger.error('Event listener error', e);
        }
      });
    }

    const allListeners = this.eventListeners.get('*');
    if (allListeners) {
      allListeners.forEach((listener) => {
        try {
          listener(event as never);
        } catch (e) {
          logger.error('Event listener error', e);
        }
      });
    }
  }

  private applyBridgeStatus(status: BridgeStatus): void {
    this.bridgeState = status.state;
    const nextIsConnected = status.isOperational;

    if (nextIsConnected === this.isConnected) {
      this.isConnected = nextIsConnected;
      return;
    }

    this.isConnected = nextIsConnected;

    this.emitEvent(nextIsConnected ? 'connected' : 'disconnected', {
      type: nextIsConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      transport: this.adapter.transport,
      state: status.state,
    });
  }
}
