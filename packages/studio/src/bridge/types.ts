import type { BridgeEvent, BridgeStatus } from '../types/events';

export type BridgeTransport = 'electron' | 'mock';

export interface BridgeAdapter {
  readonly transport: BridgeTransport;
  start: (onEvent: (event: BridgeEvent) => void) => Promise<BridgeStatus>;
  stop: () => void;
  isReady: () => boolean;
  checkReady: () => Promise<BridgeStatus>;
  send: <T = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeout?: number
  ) => Promise<T>;
}
