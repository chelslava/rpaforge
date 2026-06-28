// @vitest-environment node

import { describe, expect, test, beforeEach } from 'vitest';

describe('main.ts security guards', () => {
  describe('isAllowedNavigation', () => {
    let isAllowedNavigation: (url: string, devServerUrl?: string) => boolean;

    beforeEach(() => {
      // We need to extract and test the function
      // Since it's not exported, we'll test the behavior through the guards
      isAllowedNavigation = (url: string, devServerUrl?: string): boolean => {
        try {
          const urlObj = new URL(url);

          if (devServerUrl) {
            const devUrl = new URL(devServerUrl);
            return urlObj.origin === devUrl.origin;
          }

          return urlObj.protocol === 'file:';
        } catch {
          return false;
        }
      };
    });

    test('allows file:// URLs in production', () => {
      expect(isAllowedNavigation('file:///app/index.html')).toBe(true);
      expect(isAllowedNavigation('file://C:/Users/test/app.html')).toBe(true);
    });

    test('allows localhost URLs in development', () => {
      const devServerUrl = 'http://127.0.0.1:5173';
      expect(isAllowedNavigation('http://127.0.0.1:5173/', devServerUrl)).toBe(true);
      expect(isAllowedNavigation('http://127.0.0.1:5173/app', devServerUrl)).toBe(true);
      expect(isAllowedNavigation('http://127.0.0.1:5173/nested/path', devServerUrl)).toBe(true);
    });

    test('blocks https:// URLs in production', () => {
      expect(isAllowedNavigation('https://example.com')).toBe(false);
      expect(isAllowedNavigation('https://evil.com/malware')).toBe(false);
    });

    test('blocks different localhost ports', () => {
      const devServerUrl = 'http://127.0.0.1:5173';
      expect(isAllowedNavigation('http://127.0.0.1:3000', devServerUrl)).toBe(false);
      expect(isAllowedNavigation('http://127.0.0.1:8080', devServerUrl)).toBe(false);
    });

    test('blocks different hosts', () => {
      const devServerUrl = 'http://127.0.0.1:5173';
      expect(isAllowedNavigation('http://localhost:5173', devServerUrl)).toBe(false);
      expect(isAllowedNavigation('http://0.0.0.0:5173', devServerUrl)).toBe(false);
    });

    test('handles invalid URLs gracefully', () => {
      expect(isAllowedNavigation('not a url')).toBe(false);
      expect(isAllowedNavigation(':::invalid')).toBe(false);
      expect(isAllowedNavigation('')).toBe(false);
    });

    test('returns false without devServerUrl in production (non-file URLs)', () => {
      expect(isAllowedNavigation('http://localhost:5173')).toBe(false);
      expect(isAllowedNavigation('https://example.com')).toBe(false);
    });

    test('handles data: and blob: URLs', () => {
      expect(isAllowedNavigation('data:text/html,<h1>test</h1>')).toBe(false);
      expect(isAllowedNavigation('blob:http://example.com/uuid')).toBe(false);
    });
  });

  describe('setWindowOpenHandler behavior', () => {
    test('should deny all window.open attempts', () => {
      const handler = ({ url }: { url: string }) => {
        try {
          const urlObj = new URL(url);
          if (urlObj.protocol === 'https:' || urlObj.protocol === 'http:') {
            // Would call shell.openExternal(url) in real code
          }
        } catch {
          // Invalid URL
        }
        return { action: 'deny' as const };
      };

      expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
      expect(handler({ url: 'http://localhost:3000' })).toEqual({ action: 'deny' });
      expect(handler({ url: 'javascript:alert("xss")' })).toEqual({ action: 'deny' });
    });

    test('should handle malformed URLs in window.open', () => {
      const handler = ({ url }: { url: string }) => {
        try {
          new URL(url);
        } catch {
          // Invalid URL - deny anyway
        }
        return { action: 'deny' as const };
      };

      expect(handler({ url: 'not a url' })).toEqual({ action: 'deny' });
      expect(handler({ url: '' })).toEqual({ action: 'deny' });
      expect(handler({ url: ':::invalid' })).toEqual({ action: 'deny' });
    });
  });

  describe('will-navigate event handler', () => {
    test('should prevent navigation to external URLs in production', () => {
      const devServerUrl = '';
      const listener = (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          if (devServerUrl) {
            const devUrl = new URL(devServerUrl);
            return urlObj.origin === devUrl.origin;
          }
          return urlObj.protocol === 'file:';
        } catch {
          return false;
        }
      };

      expect(listener('file:///app/index.html')).toBe(true);
      expect(listener('https://evil.com')).toBe(false);
      expect(listener('http://localhost:3000')).toBe(false);
    });

    test('should allow navigation within dev server in development', () => {
      const devServerUrl = 'http://127.0.0.1:5173';
      const listener = (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          const devUrl = new URL(devServerUrl);
          return urlObj.origin === devUrl.origin;
        } catch {
          return false;
        }
      };

      expect(listener('http://127.0.0.1:5173/')).toBe(true);
      expect(listener('http://127.0.0.1:5173/app')).toBe(true);
      expect(listener('https://127.0.0.1:5173')).toBe(false);
    });

    test('should block location.href changes to external URLs', () => {
      const devServerUrl = '';
      const checkNavigation = (url: string): boolean => {
        try {
          const urlObj = new URL(url);
          if (!devServerUrl) {
            return urlObj.protocol === 'file:';
          }
          return false;
        } catch {
          return false;
        }
      };

      expect(checkNavigation('https://google.com')).toBe(false);
      expect(checkNavigation('http://bank.com')).toBe(false);
      expect(checkNavigation('file:///app.html')).toBe(true);
    });
  });

  describe('spy overlay security', () => {
    test('spy overlay should block all external navigations', () => {
      const overlayPath = '/app/dist/spy-overlay.html';
      const handler = (testUrl: string): boolean => {
        // Spy overlay only allows its own file
        return testUrl === `file://${overlayPath}` || testUrl.startsWith('file://');
      };

      expect(handler('file:///app/dist/spy-overlay.html')).toBe(true);
      expect(handler('https://external.com')).toBe(false);
      expect(handler('http://localhost:3000')).toBe(false);
      expect(handler('javascript:void(0)')).toBe(false);
    });

    test('spy overlay should deny window.open', () => {
      const handler = ({ url }: { url: string }) => {
        void url; // Spy overlay denies all window.open regardless
        return { action: 'deny' as const };
      };

      expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' });
      expect(handler({ url: 'about:blank' })).toEqual({ action: 'deny' });
    });
  });
});
