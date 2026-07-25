import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LazyFeature } from './LazyFeature';

let shouldThrow = true;

function UnstableFeature() {
  if (shouldThrow) {
    throw new Error('feature chunk unavailable');
  }

  return <div>feature loaded</div>;
}

describe('LazyFeature', () => {
  beforeEach(() => {
    shouldThrow = true;
  });

  test('offers a retry after a feature error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <LazyFeature>
        <UnstableFeature />
      </LazyFeature>
    );

    expect(screen.getByRole('alert').textContent).toContain('lazyFeature.error');

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'lazyFeature.retry' }));

    expect(screen.getByText('feature loaded')).toBeTruthy();
    consoleError.mockRestore();
  });
});
