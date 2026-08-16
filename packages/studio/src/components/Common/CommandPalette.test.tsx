import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CommandPalette } from './CommandPalette';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

vi.mock('../../stores/blockStore', () => ({
  useBlockStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      nodes: [
        { id: 'node-1', data: { label: 'Click Button' }, type: 'activity' },
        { id: 'node-2', data: { label: 'Open Browser' }, type: 'activity' },
      ],
    }),
}));

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      theme: 'dark',
      toggleTheme: vi.fn(),
    }),
}));

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CommandPalette open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders search input and commands when open', () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />);

    expect(screen.getByPlaceholderText(/Type a command or search nodes/i)).toBeTruthy();
    expect(screen.getByText('Run Process')).toBeTruthy();
    expect(screen.getByText('Click Button')).toBeTruthy();
  });

  it('filters items based on search input', () => {
    render(<CommandPalette open={true} onClose={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Type a command or search nodes/i);
    fireEvent.change(input, { target: { value: 'Browser' } });

    expect(screen.getByText('Open Browser')).toBeTruthy();
    expect(screen.queryByText('Click Button')).toBeNull();
  });

  it('executes command action on click', () => {
    const onRun = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} onRunProcess={onRun} />);

    const runBtn = screen.getByText('Run Process');
    fireEvent.click(runBtn);

    expect(onRun).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} />);

    const input = screen.getByPlaceholderText(/Type a command or search nodes/i);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
