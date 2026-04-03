import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useDebuggerStore } from '../../stores/debuggerStore';
import CallStackPanel from '../CallStackPanel';

describe('CallStackPanel', () => {
  beforeEach(() => {
    useDebuggerStore.setState({
      callStack: [],
      currentFile: null,
      currentLine: null,
    });
  });

  it('shows message when call stack is empty', () => {
    render(<CallStackPanel />);
    expect(screen.getByText('No call stack available')).toBeInTheDocument();
  });

  it('renders call stack frames', () => {
    useDebuggerStore.setState({
      callStack: [
        { keyword: 'Main Task', file: 'process.robot', line: 5, args: [] },
        { keyword: 'Open Application', file: 'process.robot', line: 6, args: [] },
      ],
    });

    render(<CallStackPanel />);
    expect(screen.getByText('Main Task')).toBeInTheDocument();
    expect(screen.getByText('Open Application')).toBeInTheDocument();
  });

  it('shows file and line information', () => {
    useDebuggerStore.setState({
      callStack: [{ keyword: 'Test', file: 'test.robot', line: 10, args: [] }],
    });

    render(<CallStackPanel />);
    expect(screen.getByText('test.robot:10')).toBeInTheDocument();
  });

  it('highlights current frame', () => {
    useDebuggerStore.setState({
      callStack: [
        { keyword: 'Current', file: 'test.robot', line: 5, args: [] },
        { keyword: 'Previous', file: 'test.robot', line: 3, args: [] },
      ],
      currentFile: 'test.robot',
      currentLine: 5,
    });

    render(<CallStackPanel />);
    const currentFrame = screen.getByText('Current').closest('div');
    expect(currentFrame?.className).toContain('bg-indigo');
  });
});
