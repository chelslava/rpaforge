import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useVariableStore } from '../../stores/variableStore';
import { useDiagramStore } from '../../stores/diagramStore';
import type { ProcessVariable } from '../../stores/variableStore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('./VariableDialog', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="variable-dialog" /> : null,
}));

import VariablesPanel from './VariablesPanel';

function createMockVariable(overrides: Partial<ProcessVariable> = {}): ProcessVariable {
  return {
    id: 'var-1',
    name: 'testVar',
    type: 'string',
    value: 'hello',
    scope: 'task',
    projectId: 'proj-1',
    description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('VariablesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useVariableStore.setState({ variables: [] });

    useDiagramStore.setState({
      project: {
        id: 'proj-1',
        name: 'Test Project',
        version: '1.0',
        main: '',
        diagrams: [],
        folders: [],
        settings: { defaultTimeout: 30000, screenshotOnError: true },
      },
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });
  });

  test('renders variable list when variables exist', () => {
    useVariableStore.setState({
      variables: [
        createMockVariable({ id: 'v1', name: 'myVar', value: 'hello', scope: 'process' }),
      ],
    });

    render(<VariablesPanel />);

    expect(screen.getByText('myVar')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
  });

  test('shows empty state when no variables', () => {
    render(<VariablesPanel />);

    expect(screen.getByText('emptyState.noVariables')).toBeTruthy();
    expect(screen.getByText('emptyState.createFirstVariable')).toBeTruthy();
  });

  test('add button opens VariableDialog', () => {
    render(<VariablesPanel />);

    const addButton = screen.getByTitle('variablesPanel.addVariable');
    fireEvent.click(addButton);

    expect(screen.getByTestId('variable-dialog')).toBeTruthy();
  });

  test('delete button removes a variable', () => {
    useVariableStore.setState({
      variables: [
        createMockVariable({ id: 'v1', name: 'toDelete', value: '', scope: 'process' }),
      ],
    });

    render(<VariablesPanel />);

    const deleteButton = screen.getByTitle('variablesPanel.delete');
    fireEvent.click(deleteButton);

    expect(useVariableStore.getState().variables).toHaveLength(0);
  });

  test('shows variable name, type icon, scope badge for each variable', () => {
    useVariableStore.setState({
      variables: [
        createMockVariable({ id: 'v1', name: 'strVar', type: 'string', value: 'val', scope: 'process' }),
        createMockVariable({ id: 'v2', name: 'numVar', type: 'number', value: '42', scope: 'process' }),
      ],
    });

    render(<VariablesPanel />);

    expect(screen.getByText('strVar')).toBeTruthy();
    expect(screen.getByText('numVar')).toBeTruthy();
    expect(screen.getAllByText('process').length).toBeGreaterThanOrEqual(2);
  });

  test('collapse/expand toggle works', () => {
    render(<VariablesPanel />);

    expect(screen.getByText('emptyState.noVariables')).toBeTruthy();

    const [header] = screen.getAllByRole('button', { name: /Variables/i });
    fireEvent.click(header);

    expect(screen.queryByText('emptyState.noVariables')).toBeNull();

    fireEvent.click(header);
    expect(screen.getByText('emptyState.noVariables')).toBeTruthy();
  });

  test('starts collapsed when defaultExpanded is false', () => {
    render(<VariablesPanel defaultExpanded={false} />);

    expect(screen.queryByText('emptyState.noVariables')).toBeNull();
  });
});
