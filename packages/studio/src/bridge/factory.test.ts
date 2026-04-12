import { describe, expect, test } from 'vitest';

import { createBridgeAdapter } from './factory';

describe('bridge factory', () => {
  test('returns mock adapter without Electron API', () => {
    expect(createBridgeAdapter().transport).toBe('mock');
  });
});
