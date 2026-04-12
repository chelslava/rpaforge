import { describe, expect, test } from 'vitest';

import { MockBridgeAdapter } from './mock-bridge';

describe('MockBridgeAdapter', () => {
  test('returns capabilities and generated code', async () => {
    const adapter = new MockBridgeAdapter();
    await adapter.start(() => undefined);

    const capabilities = await adapter.send<{
      version: string;
      libraries: string[];
    }>('getCapabilities', {});
    const generated = await adapter.send<{ code: string }>('generateCode', {
      diagram: {
        nodes: [],
        edges: [],
      },
    });

    expect(capabilities.version).toBe('0.1.0');
    expect(capabilities.libraries).toContain('BuiltIn');
    expect(typeof generated.code).toBe('string');
  });
});
