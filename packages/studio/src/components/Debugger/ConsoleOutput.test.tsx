import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useConsoleStore } from '../../stores/consoleStore';
import ConsoleOutput from '../ConsoleOutput';

describe('ConsoleOutput', () => {
  beforeEach(() => {
    useConsoleStore.setState({
      logs: [],
      filter: ['info', 'warn', 'error'],
      searchQuery: '',
    });
  });

  it('shows message when no logs', () => {
    render(<ConsoleOutput />);
    expect(screen.getByText('No logs available')).toBeInTheDocument();
  });

  it('renders log entries', () => {
    useConsoleStore.setState({
      logs: [
        {
          id: '1',
          timestamp: new Date(),
          level: 'info',
          message: 'Test message',
        },
      ],
    });

    render(<ConsoleOutput />);
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders filter buttons', () => {
    render(<ConsoleOutput />);
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('warn')).toBeInTheDocument();
    expect(screen.getByText('info')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ConsoleOutput />);
    expect(screen.getByPlaceholderText('Search logs...')).toBeInTheDocument();
  });

  it('filters logs by search query', () => {
    useConsoleStore.setState({
      logs: [
        { id: '1', timestamp: new Date(), level: 'info', message: 'Found this' },
        { id: '2', timestamp: new Date(), level: 'info', message: 'Hidden' },
      ],
    });

    render(<ConsoleOutput />);
    const searchInput = screen.getByPlaceholderText('Search logs...');
    
    fireEvent.change(searchInput, { target: { value: 'Found' } });
    
    expect(screen.getByText('Found this')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('shows log count', () => {
    useConsoleStore.setState({
      logs: [
        { id: '1', timestamp: new Date(), level: 'info', message: 'Log 1' },
        { id: '2', timestamp: new Date(), level: 'warn', message: 'Log 2' },
      ],
      filter: ['info', 'warn', 'error'],
    });

    render(<ConsoleOutput />);
    expect(screen.getByText(/2 of 2 entries/)).toBeInTheDocument();
  });
});
