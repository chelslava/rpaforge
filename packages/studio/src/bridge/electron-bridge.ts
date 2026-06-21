import type { BridgeEvent, BridgeStatus } from '../types/events';
import type { BridgeAdapter } from './types';

export class ElectronBridgeAdapter implements BridgeAdapter {
  readonly transport = 'electron' as const;
  private connected = false;
  private unsubscribe: (() => void) | null = null;

  async start(onEvent: (event: BridgeEvent) => void): Promise<BridgeStatus> {
    if (!window.rpaforge) {
      throw new Error('Electron API not available');
    }

    this.unsubscribe?.();
    this.unsubscribe = window.rpaforge.bridge.onEvent(onEvent);
    const status = await window.rpaforge.bridge.getStatus();
    this.connected = status.isOperational;
    return status;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.connected = false;
  }

  isReady(): boolean {
    return this.connected;
  }

  async checkReady(): Promise<BridgeStatus> {
    if (!window.rpaforge) {
      throw new Error('Electron API not available');
    }

    const status = await window.rpaforge.bridge.getStatus();
    this.connected = status.isOperational;
    return status;
  }

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    _timeout?: number
  ): Promise<T> {
    if (!window.rpaforge) {
      throw new Error('Electron API not available');
    }

    // BridgeAdapter is transport-agnostic and accepts any method name; the
    // underlying IPC contract is narrowed to BridgeMethodMap, so this is the
    // one intentional widening at the generic-adapter/typed-contract boundary.
    const send = window.rpaforge.bridge.send as (
      method: string,
      params: Record<string, unknown>
    ) => Promise<unknown>;
    return send(method, params) as Promise<T>;
  }
}
