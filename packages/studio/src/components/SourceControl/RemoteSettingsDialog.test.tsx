import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import RemoteSettingsDialog from './RemoteSettingsDialog';

describe('RemoteSettingsDialog', () => {
  test('renders nothing when closed', () => {
    render(
      <RemoteSettingsDialog
        open={false}
        currentUrl={null}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('prefills the input with the current remote URL', () => {
    render(
      <RemoteSettingsDialog
        open={true}
        currentUrl="https://example.com/repo.git"
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('https://example.com/repo.git')).toBeTruthy();
    expect(screen.queryByText('gitSourceControl.noRemoteConfigured')).toBeNull();
  });

  test('shows the no-remote hint when currentUrl is null', () => {
    render(
      <RemoteSettingsDialog
        open={true}
        currentUrl={null}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('gitSourceControl.noRemoteConfigured')).toBeTruthy();
  });

  test('Save button is disabled until a URL is entered', () => {
    render(
      <RemoteSettingsDialog
        open={true}
        currentUrl={null}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const saveButton = screen.getByText('gitSourceControl.save');
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('gitSourceControl.remoteUrl'), {
      target: { value: 'https://example.com/repo.git' },
    });

    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
  });

  test('clicking Save calls onSave with the trimmed URL', () => {
    const onSave = vi.fn();
    render(
      <RemoteSettingsDialog
        open={true}
        currentUrl={null}
        isSaving={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('gitSourceControl.remoteUrl'), {
      target: { value: '  https://example.com/repo.git  ' },
    });
    fireEvent.click(screen.getByText('gitSourceControl.save'));

    expect(onSave).toHaveBeenCalledWith('https://example.com/repo.git');
  });

  test('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <RemoteSettingsDialog
        open={true}
        currentUrl="https://example.com/repo.git"
        isSaving={false}
        onSave={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('actions.cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('Save button is disabled while isSaving is true', () => {
    render(
      <RemoteSettingsDialog
        open={true}
        currentUrl="https://example.com/repo.git"
        isSaving={true}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect((screen.getByText('gitSourceControl.save') as HTMLButtonElement).disabled).toBe(true);
  });
});
