import { describe, expect, test, vi } from 'vitest';

import { createLogger } from './logger';

describe('logger', () => {
  test('suppresses debug logging when disabled', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = createLogger('test', { debugEnabled: false });

    logger.debug('hidden');

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('emits formatted warnings', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = createLogger('test');

    logger.warn('problem');

    expect(warnSpy).toHaveBeenCalledWith('[test] problem');
    warnSpy.mockRestore();
  });
});
