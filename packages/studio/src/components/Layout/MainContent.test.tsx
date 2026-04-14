import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import MainContent from './MainContent';
import { useDiagramStore } from '../../stores/diagramStore';

vi.mock('../Designer/ProcessCanvas', () => ({
  default: () => <div>ProcessCanvas</div>,
}));

vi.mock('../Debugger/ConsoleOutput', () => ({
  default: () => <div>ConsoleOutput</div>,
}));

vi.mock('../Designer/DiagramTabs', () => ({
  default: () => <div>DiagramTabs</div>,
}));

vi.mock('../Designer/BreadcrumbNavigation', () => ({
  default: () => <div>BreadcrumbNavigation</div>,
}));

vi.mock('../../hooks/useDiagramWorkspace', () => ({
  useDiagramWorkspace: () => undefined,
}));

describe('MainContent', () => {
  beforeEach(() => {
    useDiagramStore.persist.clearStorage();
    useDiagramStore.setState({
      project: null,
      activeDiagramId: null,
      openDiagramIds: [],
      recentDiagrams: [],
      folders: [],
      diagramDocuments: {},
    });
  });

  test('renders a distinct debugger workspace', () => {
    useDiagramStore.getState().createProject('My Project');

    render(<MainContent activeTab="debugger" showConsole={false} />);

    expect(screen.getByText('ProcessCanvas')).toBeTruthy();
    expect(screen.getByText('ConsoleOutput')).toBeTruthy();
    expect(screen.getByText('DiagramTabs')).toBeTruthy();
    expect(screen.getByText('BreadcrumbNavigation')).toBeTruthy();
  });

  test('designer tab keeps console hidden when default toggle is off', () => {
    useDiagramStore.getState().createProject('My Project');

    render(<MainContent activeTab="designer" showConsole={false} />);

    expect(screen.getByText('ProcessCanvas')).toBeTruthy();
    expect(screen.queryByText('ConsoleOutput')).toBeNull();
  });
});
