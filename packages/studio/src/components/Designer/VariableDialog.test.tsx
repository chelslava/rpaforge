import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock('./ExpressionEditor', () => ({
  default: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input
      data-testid="expression-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

const { getVariableNameErrorMock } = vi.hoisted(() => ({
  getVariableNameErrorMock: vi.fn().mockReturnValue(null),
}));

vi.mock('../../utils/variableValidation', () => ({
  getVariableNameError: getVariableNameErrorMock,
}));

import VariableDialog from './VariableDialog';

describe('VariableDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getVariableNameErrorMock.mockReturnValue(null);
  });

  test('returns null when isOpen is false', () => {
    const { container } = render(
      <VariableDialog
        isOpen={false}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  test('renders form when isOpen is true', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('variableDialog.createVariable')).toBeTruthy();
    expect(screen.getByLabelText('variableDialog.name')).toBeTruthy();
    expect(screen.getByLabelText('variableDialog.value')).toBeTruthy();
    expect(screen.getByLabelText('variableDialog.scope')).toBeTruthy();
  });

  test('shows all form fields (name, type, value, scope)', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    expect(screen.getByLabelText('variableDialog.name')).toBeTruthy();
    expect(screen.getByLabelText('variableDialog.value')).toBeTruthy();
    expect(screen.getByLabelText('variableDialog.scope')).toBeTruthy();
    expect(screen.getByLabelText('variableDialog.description')).toBeTruthy();

    expect(screen.getByRole('radiogroup', { name: 'Variable type' })).toBeTruthy();
  });

  test('can type in name field', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const nameInput = screen.getByLabelText('variableDialog.name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'myVariable' } });

    expect(nameInput.value).toBe('myVariable');
  });

  test('can select type from type buttons', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    expect(screen.getByText('variableDialog.stringType')).toBeTruthy();

    const numberTypeButton = screen.getByTitle('variableDialog.numberType');
    fireEvent.click(numberTypeButton);

    expect(screen.getByText('variableDialog.numberType')).toBeTruthy();
    expect(screen.queryByText('variableDialog.stringType')).toBeNull();
  });

  test('can type value', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const valueInput = screen.getByLabelText('variableDialog.value') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: 'testValue' } });

    expect(valueInput.value).toBe('testValue');
  });

  test('calls onCreate with correct data on submit', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const nameInput = screen.getByLabelText('variableDialog.name');
    fireEvent.change(nameInput, { target: { value: 'myVar' } });

    const valueInput = screen.getByLabelText('variableDialog.value');
    fireEvent.change(valueInput, { target: { value: 'hello' } });

    const submitButton = screen.getByText('variableDialog.create');
    fireEvent.click(submitButton);

    expect(mockOnCreate).toHaveBeenCalledTimes(1);
    expect(mockOnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'myVar',
        type: 'string',
        value: 'hello',
        scope: 'task',
      })
    );
  });

  test('shows validation error for invalid name', () => {
    getVariableNameErrorMock.mockReturnValue('Variable name must be a valid Python identifier');

    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const nameInput = screen.getByLabelText('variableDialog.name');
    fireEvent.change(nameInput, { target: { value: 'invalid name!' } });

    expect(screen.getByText('Variable name must be a valid Python identifier')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();

    const submitButton = screen.getByText('variableDialog.create') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  test('shows error for duplicate name', () => {
    getVariableNameErrorMock.mockReturnValue(null);

    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        existingVariables={['existingVar']}
      />
    );

    const nameInput = screen.getByLabelText('variableDialog.name');
    fireEvent.change(nameInput, { target: { value: 'existingVar' } });

    expect(screen.getByText('variableDialog.nameExists')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  test('pre-fills form in edit mode', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        editVariable={{
          name: 'editMe',
          type: 'number',
          value: '42',
          scope: 'process',
          description: 'Test description',
        }}
      />
    );

    const nameInput = screen.getByLabelText('variableDialog.name') as HTMLInputElement;
    expect(nameInput.value).toBe('editMe');

    expect(screen.getByText('variableDialog.numberType')).toBeTruthy();

    const processRadio = screen.getByDisplayValue('process') as HTMLInputElement;
    expect(processRadio.checked).toBe(true);

    const valueInput = screen.getByLabelText('variableDialog.value') as HTMLInputElement;
    expect(valueInput.value).toBe('42');

    const descInput = screen.getByLabelText('variableDialog.description') as HTMLInputElement;
    expect(descInput.value).toBe('Test description');

    expect(screen.getByText('variableDialog.update')).toBeTruthy();
  });

  test('calls onClose when close button clicked', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const closeButton = screen.getByLabelText('variableDialog.close');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('submit button is disabled when name is empty', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const submitButton = screen.getByText('variableDialog.create') as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  test('cancel button calls onClose', () => {
    render(
      <VariableDialog
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );

    const cancelButton = screen.getByText('variableDialog.cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
