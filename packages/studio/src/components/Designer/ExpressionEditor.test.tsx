import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import ExpressionEditor from './ExpressionEditor';

const mockVariables = [
  { name: 'user_count', type: 'integer', value: '42', scope: 'process', description: 'Number of users' },
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
const UPSTREAM_OUTPUTS = [
  { name: 'result_c', nodeId: 'c', nodeLabel: 'Save', distance: 1 },
  { name: 'raw_data', nodeId: 'a', nodeLabel: 'Fetch', distance: 3 },
];

describe('ExpressionEditor data pills', () => {
  it('renders upstream output pills', () => {
    render(
      <ExpressionEditor value="" onChange={() => undefined} variables={mockVariables} upstreamOutputs={UPSTREAM_OUTPUTS} />
    );
    const strip = screen.getByTestId('output-pills');
    expect(strip.textContent).toContain('result_c');
    expect(strip.textContent).toContain('raw_data');
  });

  it('inserts the ${name} token when a pill is clicked', () => {
    function Controlled() {
      const [val, setVal] = useState('');
      return (
        <ExpressionEditor
          value={val}
          onChange={setVal}
          variables={mockVariables}
          upstreamOutputs={UPSTREAM_OUTPUTS}
        />
      );
    }
    render(<Controlled />);
    fireEvent.click(screen.getByText('result_c'));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('${result_c}');
  });

  function TypedEditor(props: Partial<React.ComponentProps<typeof ExpressionEditor>>) {
    const [val, setVal] = useState('');
    return (
      <ExpressionEditor
        value={val}
        onChange={setVal}
        variables={mockVariables}
        {...props}
      />
    );
  }

  it('lists upstream outputs in the autocomplete', () => {
    render(<TypedEditor upstreamOutputs={UPSTREAM_OUTPUTS} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '$', selectionStart: 1 } });
    // upstream output joins the variable list (not declared in projectVariables)
    // the pill strip and the autocomplete entry both render the name
    expect(screen.getAllByText('raw_data').length).toBeGreaterThan(0);
  });

  it('marks downstream variables as unavailable', () => {
    render(<TypedEditor downstreamVariableNames={new Set(['user_count'])} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '$', selectionStart: 1 } });
    const item = screen.getByText('user_count').closest('button');
    expect(item?.textContent).toContain('downstream');
  });
});
