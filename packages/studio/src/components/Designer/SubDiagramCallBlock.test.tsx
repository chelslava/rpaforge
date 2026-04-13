import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';

import SubDiagramCallBlock from './SubDiagramCallBlock';
import { useDiagramStore } from '../../stores/diagramStore';

describe('SubDiagramCallBlock', () => {
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
    useDiagramStore.getState().createProject('My Project');

    useDiagramStore.getState().addDiagram({
      name: 'Login Flow',
      type: 'sub-diagram',
      path: 'processes/auth/login.flow.diagram.json',
      folder: 'auth',
      inputs: ['username'],
      outputs: ['success'],
    });
  });

  test('opens the target diagram from the call block button', () => {
    const diagram = useDiagramStore
      .getState()
      .project?.diagrams.find((item) => item.name === 'Login Flow');

    if (!diagram) {
      throw new Error('Expected Login Flow diagram to be present');
    }

    render(
      <SubDiagramCallBlock
        diagramId={diagram.id}
        diagramName={diagram.name}
        parameterMappings={{ username: 'user' }}
        outputMappings={{ success: 'login_success' }}
      />
    );

    fireEvent.click(screen.getByTitle('Open diagram'));

    expect(useDiagramStore.getState().activeDiagramId).toBe(diagram.id);
  });
});
