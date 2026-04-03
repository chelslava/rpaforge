/**
 * RPAForge Python Bridge Browser Mock
 *
 * Mock implementation for browser/development environment.
 */

import type { EventListener } from '../types/events';

export class PythonBridge {
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private isConnected = false;

  async start(): Promise<void> {
    this.isConnected = true;
    this.emitInternalEvent('connected');
    console.log('[PythonBridge Mock] Started');
  }

  stop(): void {
    this.isConnected = false;
    this.emitInternalEvent('disconnected');
    console.log('[PythonBridge Mock] Stopped');
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async sendRequest<T = unknown>(
    _method: string,
    _params: Record<string, unknown>,
    _timeout = 30000
  ): Promise<T> {
    if (!this.isConnected) {
      throw new Error('Not connected');
    }

    return {} as T;
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

  private emitInternalEvent(eventType: string): void {
    const event = { type: eventType };
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event as never);
        } catch (e) {
          console.error(`[PythonBridge Mock] Event listener error:`, e);
        }
      });
    }
  }
}
