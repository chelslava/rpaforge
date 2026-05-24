import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import ErrorBoundary from './ErrorBoundary';

// Mock t function to return translation key for testing
vi.mock('react-i18next', () => ({
  withTranslation: (ns: string) => (Component: React.ComponentType<Record<string, unknown>>) => {
    const WrappedComponent = (props: Record<string, unknown>) => {
      const t = (key: string) => key;
      return <Component {...props} t={t} />;
    };
    WrappedComponent.displayName = `withTranslation(${ns})`;
    return WrappedComponent;
  },
  useTranslation: (_ns: string) => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>Normal content</div>;
};

describe('ErrorBoundary', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalEnv;
  });

  test('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeTruthy();
  });

  test('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom fallback')).toBeTruthy();
  });

  test('renders error UI when error is thrown', () => {
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('errors.somethingWentWrong')).toBeTruthy();
    expect(screen.getByText('errors.tryAgain')).toBeTruthy();
    expect(screen.getByText('errors.reloadPage')).toBeTruthy();
  });

  test('shows error details in development mode', () => {
    process.env.NODE_ENV = 'development';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('errors.somethingWentWrong')).toBeTruthy();
    expect(screen.getByText('errors.somethingWentWrongDesc')).toBeTruthy();
    expect(screen.getByText('errors.tryAgain')).toBeTruthy();
    expect(screen.getByText('errors.reloadPage')).toBeTruthy();
  });

  test('hides error details in production mode', () => {
    process.env.NODE_ENV = 'production';

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('errors.somethingWentWrong')).toBeTruthy();
    expect(screen.queryByText('Test error')).toBeNull();
  });
});
