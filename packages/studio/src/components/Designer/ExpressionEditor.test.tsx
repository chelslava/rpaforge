import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useState } from 'react';
import ExpressionEditor from './ExpressionEditor';

const mockVariables = [
  { name: 'user_count', type: 'integer', value: 42, scope: 'process', description: 'Number of users' },
  { name: 'api_url', type: 'string', value: 'https://api.example.com', scope: 'process', description: 'Base URL' },
];

function ControlledEditor({ initialValue = '' }: { initialValue?: string }) {
  const [val, setVal] = useState(initialValue);
  return <ExpressionEditor value={val} onChange={setVal} variables={mockVariables} />;
}

describe('ExpressionEditor', () => {
  it('renders expression input properly', () => {
    render(<ControlledEditor initialValue="Hello" />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Hello');
  });

  it('triggers autocomplete popup when typing $', () => {
    render(<ControlledEditor initialValue="" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '$', selectionStart: 1 } });
    
    // Autocomplete dropdown should list variables
    expect(screen.getByText('user_count')).toBeTruthy();
    expect(screen.getByText('api_url')).toBeTruthy();
  });

  it('filters suggestions when typing variable prefix', () => {
    render(<ControlledEditor initialValue="" />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '$user', selectionStart: 5 } });

    expect(screen.getByText('user_count')).toBeTruthy();
    expect(screen.queryByText('api_url')).toBeNull();
  });
});
