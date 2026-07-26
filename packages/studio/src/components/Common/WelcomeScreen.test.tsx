import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { WelcomeScreen } from './WelcomeScreen';
import { hasDismissedWelcome } from '../../utils/storage';

vi.mock('../../../hooks/useDesigner', () => ({
  useDesigner: () => ({ categories: [] }),
}));

vi.mock('../../../stores/fileStore', () => ({
  useFileStore: () => ({ recentFiles: [] }),
}));

vi.mock('../../../stores/designerStore', () => ({
  useDesignerStore: () => ({
    recentActivityIds: [],
    favoriteActivityIds: [],
  }),
}));

const renderWelcome = (onDismiss = vi.fn()) => render(
  <WelcomeScreen
    onNewProcess={vi.fn()}
    onOpenProcess={vi.fn()}
    onDismiss={onDismiss}
    onImportMermaid={vi.fn()}
    onBrowseLibraries={vi.fn()}
    onGettingStarted={vi.fn()}
  />,
);

describe('WelcomeScreen accessibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('renders an accessible dialog and focuses its first control', async () => {
    renderWelcome();

    const dialog = await screen.findByRole('dialog', { name: 'welcome.title' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'welcome-dialog-title');
    expect(screen.getByRole('button', { name: 'fileMenu.closeDialog' })).toHaveFocus();
  });

  test('contains Tab navigation, closes on Escape, and restores focus to the trigger', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open welcome</button>
          {open && <WelcomeScreen
            onNewProcess={vi.fn()}
            onOpenProcess={vi.fn()}
            onDismiss={() => setOpen(false)}
            onImportMermaid={vi.fn()}
            onBrowseLibraries={vi.fn()}
            onGettingStarted={vi.fn()}
          />}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open welcome' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    const focusable = within(dialog).getAllByRole('button');
    const first = focusable[0];
    const last = dialog.querySelector('input[type="checkbox"]') as HTMLInputElement;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  test('persists the do-not-show-again preference when dismissed', () => {
    const onDismiss = vi.fn();
    renderWelcome(onDismiss);

    fireEvent.click(screen.getByLabelText('welcome.dontShowAgain'));
    fireEvent.click(screen.getByRole('button', { name: 'fileMenu.closeDialog' }));

    expect(hasDismissedWelcome()).toBe(true);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
