import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import VariableDialog from './VariableDialog';

describe('VariableDialog', () => {
  test('shows an error and blocks submit for Python reserved keywords', () => {
    const onCreate = vi.fn();

    render(<VariableDialog isOpen onClose={vi.fn()} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'class' } });
    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    expect(screen.getByRole('alert').textContent).toContain('Python reserved keyword');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
