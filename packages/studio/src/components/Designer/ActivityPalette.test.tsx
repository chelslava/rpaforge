import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useProcessStore } from '../../stores/processStore';
import ActivityPalette from '../ActivityPalette';

vi.mock('../../hooks/useDesigner', () => ({
  useDesigner: () => ({
    categories: [
      {
        name: 'Control Flow',
        items: [
          { name: 'IF', library: 'BuiltIn', description: 'Conditional statement' },
          { name: 'FOR', library: 'BuiltIn', description: 'Loop statement' },
        ],
      },
      {
        name: 'Logging',
        items: [
          { name: 'Log', library: 'BuiltIn', description: 'Log message' },
        ],
      },
    ],
  }),
}));

describe('ActivityPalette', () => {
  beforeEach(() => {
    useProcessStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
    });
  });

  it('renders activity palette', () => {
    render(<ActivityPalette />);
    expect(screen.getByText('Activities')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ActivityPalette />);
    expect(screen.getByPlaceholderText('Search activities...')).toBeInTheDocument();
  });

  it('renders category sections', () => {
    render(<ActivityPalette />);
    expect(screen.getByText('Control Flow')).toBeInTheDocument();
    expect(screen.getByText('Logging')).toBeInTheDocument();
  });

  it('renders activities in categories', () => {
    render(<ActivityPalette />);
    expect(screen.getByText('IF')).toBeInTheDocument();
    expect(screen.getByText('FOR')).toBeInTheDocument();
    expect(screen.getByText('Log')).toBeInTheDocument();
  });

  it('filters activities by search query', () => {
    render(<ActivityPalette />);
    const searchInput = screen.getByPlaceholderText('Search activities...');
    
    fireEvent.change(searchInput, { target: { value: 'IF' } });
    
    expect(screen.getByText('IF')).toBeInTheDocument();
    expect(screen.queryByText('FOR')).not.toBeInTheDocument();
    expect(screen.queryByText('Log')).not.toBeInTheDocument();
  });

  it('shows no activities message when search has no results', () => {
    render(<ActivityPalette />);
    const searchInput = screen.getByPlaceholderText('Search activities...');
    
    fireEvent.change(searchInput, { target: { value: 'NonExistentActivity' } });
    
    expect(screen.getByText('No activities found')).toBeInTheDocument();
  });

  it('makes activity items draggable', () => {
    render(<ActivityPalette />);
    const ifActivity = screen.getByText('IF').closest('[draggable]');
    expect(ifActivity).toHaveAttribute('draggable', 'true');
  });
});
