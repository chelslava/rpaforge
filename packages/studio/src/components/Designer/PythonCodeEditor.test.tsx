import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useSettingsStore } from '../../stores/settingsStore';
import { useVariableStore } from '../../stores/variableStore';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor" />,
}));

vi.mock('../CodeEditor/StatusBar', () => ({
  default: () => <div data-testid="status-bar" />,
}));

vi.mock('../CodeEditor/CodeToolbar', () => ({
  default: () => <div data-testid="code-toolbar" />,
}));

vi.mock('../CodeEditor/SnippetPanel', () => ({
  default: () => <div data-testid="snippet-panel" />,
}));

vi.mock('../CodeEditor/VariablesPanel', () => ({
  default: () => <div data-testid="variables-panel" />,
}));

vi.mock('../Common/ConfirmDialog', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div data-testid="confirm-dialog" /> : null,
}));

vi.mock('../CodeEditor/hooks/useRPACompletions', () => ({
  useRPACompletions: () => ({
    activities: [],
    registerCompletions: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTheme', () => ({
  useResolvedTheme: () => 'light' as const,
  useForcedColors: () => false,
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

import PythonCodeEditor from './PythonCodeEditor';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PythonCodeEditor', () => {
  beforeEach(() => {
    useSettingsStore.persist.clearStorage();
    useSettingsStore.setState({
      editor: {
        fontSize: 14,
        tabSize: 2,
        wordWrap: true,
        minimap: false,
        lineNumbers: true,
        formatOnSave: false,
      },
      theme: 'system',
    });
    useVariableStore.getState().clearVariables();
  });

  test('returns null when isOpen is false', () => {
    const { container } = render(
      <PythonCodeEditor
        isOpen={false}
        code="print('hello')"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  test('renders the editor when isOpen is true', () => {
    render(
      <PythonCodeEditor
        isOpen
        code="print('hello')"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('monaco-editor')).toBeTruthy();
  });

  test('shows the close button and triggers onClose when clicked', () => {
    const onClose = vi.fn();

    render(
      <PythonCodeEditor
        isOpen
        code="print('hello')"
        onClose={onClose}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('codeEditor.editor.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('shows the title if provided', () => {
    render(
      <PythonCodeEditor
        isOpen
        code="print('hello')"
        onClose={vi.fn()}
        onSave={vi.fn()}
        title="My Custom Title"
      />
    );

    expect(screen.getByText('My Custom Title')).toBeTruthy();
  });

  test('shows the save button', () => {
    render(
      <PythonCodeEditor
        isOpen
        code="print('hello')"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('codeEditor.editor.save')).toBeTruthy();
  });

  test('renders without crashing with basic props', () => {
    render(
      <PythonCodeEditor
        isOpen
        code=""
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
