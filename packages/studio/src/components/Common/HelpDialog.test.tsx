import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import HelpDialog from './HelpDialog';

describe('HelpDialog', () => {
  test('allows the welcome preference to be reset', () => {
    const onResetWelcome = vi.fn();

    render(<HelpDialog open onClose={vi.fn()} onResetWelcome={onResetWelcome} />);

    fireEvent.click(screen.getByRole('button', { name: 'help.showWelcome' }));

    expect(onResetWelcome).toHaveBeenCalledOnce();
  });
});
