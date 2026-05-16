import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { InlineLoading, LoadingOverlay, Spinner } from './Loading';

describe('Spinner', () => {
  test('renders the default medium size', () => {
    const { container } = render(<Spinner />);

    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
    expect(spinner?.getAttribute('class')).toContain('w-6 h-6');
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
  });

  test('renders each supported size', () => {
    const expectedClasses = {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-8 h-8',
    } as const;

    for (const [size, expectedClass] of Object.entries(expectedClasses)) {
      const { container, unmount } = render(
        <Spinner size={size as keyof typeof expectedClasses} />
      );

      expect(container.querySelector('svg')?.getAttribute('class')).toContain(expectedClass);
      unmount();
    }
  });

  test('applies custom class names', () => {
    const { container } = render(<Spinner className="text-indigo-600" />);

    expect(container.querySelector('svg')?.getAttribute('class')).toContain('text-indigo-600');
  });
});

describe('LoadingOverlay', () => {
  test('does not render when hidden', () => {
    render(<LoadingOverlay isVisible={false} message="Loading data" />);

    expect(screen.queryByText('Loading data')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('renders an accessible loading alert when visible', () => {
    render(<LoadingOverlay isVisible={true} message="Loading data" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.getAttribute('aria-busy')).toBe('true');
    expect(alert.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Loading data')).toBeTruthy();
  });

  test('shows and clamps valid progress values', () => {
    render(<LoadingOverlay isVisible={true} progress={125} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('100%')).toBeTruthy();
  });

  test('does not show progress for invalid values', () => {
    render(<LoadingOverlay isVisible={true} progress={-1} />);

    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('InlineLoading', () => {
  test('renders children when not loading', () => {
    render(
      <InlineLoading isLoading={false}>
        <button>Continue</button>
      </InlineLoading>
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  test('renders loading text when loading', () => {
    render(
      <InlineLoading isLoading={true} loadingText="Working">
        <button>Continue</button>
      </InlineLoading>
    );

    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.getByText('Working')).toBeTruthy();
  });
});
