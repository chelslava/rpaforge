import { ElectronBridgeAdapter } from './electron-bridge';
import { MockBridgeAdapter } from './mock-bridge';
import type { BridgeAdapter } from './types';

export function createBridgeAdapter(): BridgeAdapter {
  if (typeof window !== 'undefined' && window.rpaforge) {
    return new ElectronBridgeAdapter();
  }

  return new MockBridgeAdapter();
}
