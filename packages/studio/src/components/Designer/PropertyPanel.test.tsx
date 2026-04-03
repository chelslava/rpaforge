import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useProcessStore } from '../../stores/processStore';
import PropertyPanel from '../PropertyPanel';

describe('PropertyPanel', () => {
  beforeEach(() => {
    useProcessStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
    });
  });

  it('shows message when no activity selected', () => {
    render(<PropertyPanel />);
    expect(screen.getByText('No activity selected')).toBeInTheDocument();
  });

  it('shows properties for selected activity', () => {
    const node = {
      id: 'node-1',
      type: 'activity',
      position: { x: 0, y: 0 },
      data: {
        activity: {
          name: 'Open Application',
          library: 'DesktopUI',
          category: 'Application',
          description: 'Open desktop application',
          arguments: [],
        },
        arguments: [],
        timeout: 30,
        continueOnError: false,
      },
    };

    useProcessStore.setState({
      nodes: [node],
      selectedNodeId: 'node-1',
    });

    render(<PropertyPanel />);
    expect(screen.getByText('Open Application')).toBeInTheDocument();
    expect(screen.getByText('DesktopUI')).toBeInTheDocument();
  });

  it('shows description field', () => {
    const node = {
      id: 'node-1',
      type: 'activity',
      position: { x: 0, y: 0 },
      data: {
        activity: {
          name: 'Test Activity',
          library: 'BuiltIn',
          category: 'Test',
          description: 'Test description',
          arguments: [],
        },
        arguments: [],
        timeout: 30,
        continueOnError: false,
      },
    };

    useProcessStore.setState({
      nodes: [node],
      selectedNodeId: 'node-1',
    });

    render(<PropertyPanel />);
    expect(screen.getByPlaceholderText('Add description...')).toBeInTheDocument();
  });

  it('shows arguments section', () => {
    const node = {
      id: 'node-1',
      type: 'activity',
      position: { x: 0, y: 0 },
      data: {
        activity: {
          name: 'Test',
          library: 'BuiltIn',
          category: 'Test',
          description: '',
          arguments: [],
        },
        arguments: [],
        timeout: 30,
        continueOnError: false,
      },
    };

    useProcessStore.setState({
      nodes: [node],
      selectedNodeId: 'node-1',
    });

    render(<PropertyPanel />);
    expect(screen.getByText('Arguments')).toBeInTheDocument();
    expect(screen.getByText('+ Add Argument')).toBeInTheDocument();
  });

  it('shows timeout field', () => {
    const node = {
      id: 'node-1',
      type: 'activity',
      position: { x: 0, y: 0 },
      data: {
        activity: {
          name: 'Test',
          library: 'BuiltIn',
          category: 'Test',
          description: '',
          arguments: [],
        },
        arguments: [],
        timeout: 60,
        continueOnError: false,
      },
    };

    useProcessStore.setState({
      nodes: [node],
      selectedNodeId: 'node-1',
    });

    render(<PropertyPanel />);
    expect(screen.getByLabelText('Timeout (s)')).toBeInTheDocument();
  });
});
