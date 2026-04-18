import { describe, expect, test, beforeEach, vi } from 'vitest';
import type { Node } from '@reactflow/core';

import { validateProjectDiagramState } from '../utils/diagramValidation';
import type { ProcessNodeData } from '../stores/processStore';
import type { DiagramDocument, DiagramMetadata } from '../stores/diagramStore';

function createNode(
  id: string,
  type: string,
  blockData?: Record<string, unknown>
): Node<ProcessNodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { blockData: { type, id, ...blockData } as unknown as ProcessNodeData['blockData'] },
  } as Node<ProcessNodeData>;
}

describe('Diagram Validation Integration', () => {
  describe('Circular Reference Detection Flow', () => {
    test('detects circular references in complex nested diagrams', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
        { id: 'sub1', name: 'Sub1', type: 'sub-diagram', path: 'sub1.process', createdAt: '', updatedAt: '' },
        { id: 'sub2', name: 'Sub2', type: 'sub-diagram', path: 'sub2.process', createdAt: '', updatedAt: '' },
        { id: 'sub3', name: 'Sub3', type: 'sub-diagram', path: 'sub3.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [createNode('n1', 'start'), createNode('n2', 'sub-diagram-call', { diagramId: 'sub1' })],
          edges: [],
        },
        sub1: {
          metadata: { id: 'sub1', name: 'Sub1', createdAt: '', updatedAt: '' },
          nodes: [createNode('n3', 'sub-diagram-call', { diagramId: 'sub2' })],
          edges: [],
        },
        sub2: {
          metadata: { id: 'sub2', name: 'Sub2', createdAt: '', updatedAt: '' },
          nodes: [createNode('n4', 'sub-diagram-call', { diagramId: 'sub3' })],
          edges: [],
        },
        sub3: {
          metadata: { id: 'sub3', name: 'Sub3', createdAt: '', updatedAt: '' },
          nodes: [createNode('n5', 'sub-diagram-call', { diagramId: 'main' })],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors.some(e => e.type === 'circular_reference')).toBe(true);
    });

    test('passes validation for valid deep nesting within limit', () => {
      const diagrams: DiagramMetadata[] = Array.from({ length: 5 }, (_, i) => ({
        id: `diag${i}`,
        name: `Diagram ${i}`,
        type: i === 0 ? 'main' : 'sub-diagram' as const,
        path: `diag${i}.process`,
        createdAt: '',
        updatedAt: '',
      }));

      const diagramDocuments: Record<string, DiagramDocument> = {};
      diagrams.forEach((diag, i) => {
        const nextDiag = diagrams[i + 1];
        diagramDocuments[diag.id] = {
          metadata: { id: diag.id, name: diag.name, createdAt: '', updatedAt: '' },
          nodes: nextDiag
            ? [createNode(`n${i}`, 'sub-diagram-call', { diagramId: nextDiag.id })]
            : [createNode(`n${i}`, 'end')],
          edges: [],
        };
      });

      const errors = validateProjectDiagramState('diag0', diagrams, diagramDocuments);

      expect(errors.filter(e => e.type === 'circular_reference' || e.type === 'max_depth')).toHaveLength(0);
    });

    test('detects max depth exceeded', () => {
      const diagrams: DiagramMetadata[] = Array.from({ length: 12 }, (_, i) => ({
        id: `diag${i}`,
        name: `Diagram ${i}`,
        type: i === 0 ? 'main' : 'sub-diagram' as const,
        path: `diag${i}.process`,
        createdAt: '',
        updatedAt: '',
      }));

      const diagramDocuments: Record<string, DiagramDocument> = {};
      diagrams.forEach((diag, i) => {
        const nextDiag = diagrams[i + 1];
        diagramDocuments[diag.id] = {
          metadata: { id: diag.id, name: diag.name, createdAt: '', updatedAt: '' },
          nodes: nextDiag
            ? [createNode(`n${i}`, 'sub-diagram-call', { diagramId: nextDiag.id })]
            : [createNode(`n${i}`, 'end')],
          edges: [],
        };
      });

      const errors = validateProjectDiagramState('diag0', diagrams, diagramDocuments);

      expect(errors.some(e => e.type === 'max_depth')).toBe(true);
    });
  });

  describe('Parameter Validation Flow', () => {
    test('validates missing parameters across sub-diagrams', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
        {
          id: 'login',
          name: 'Login',
          type: 'sub-diagram',
          path: 'login.process',
          inputs: ['username', 'password'],
          createdAt: '',
          updatedAt: '',
        },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [
            createNode('n1', 'start'),
            createNode('n2', 'sub-diagram-call', {
              diagramId: 'login',
              parameters: { username: '${user}' },
            }),
          ],
          edges: [],
        },
        login: {
          metadata: { id: 'login', name: 'Login', createdAt: '', updatedAt: '' },
          nodes: [createNode('n3', 'start'), createNode('n4', 'end')],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors.some(e => e.type === 'invalid_parameter' && e.message.includes('password'))).toBe(true);
    });

    test('passes validation when all parameters provided', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
        {
          id: 'login',
          name: 'Login',
          type: 'sub-diagram',
          path: 'login.process',
          inputs: ['username', 'password'],
          createdAt: '',
          updatedAt: '',
        },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [
            createNode('n1', 'start'),
            createNode('n2', 'sub-diagram-call', {
              diagramId: 'login',
              parameters: { username: '${user}', password: '${pass}' },
            }),
          ],
          edges: [],
        },
        login: {
          metadata: { id: 'login', name: 'Login', createdAt: '', updatedAt: '' },
          nodes: [createNode('n3', 'start'), createNode('n4', 'end')],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors.filter(e => e.type === 'invalid_parameter')).toHaveLength(0);
    });
  });

  describe('Missing Diagram Validation', () => {
    test('detects missing sub-diagram reference', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [
            createNode('n1', 'start'),
            createNode('n2', 'sub-diagram-call', { diagramId: 'nonexistent' }),
          ],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors.some(e => e.type === 'missing_diagram')).toBe(true);
    });

    test('detects missing diagram in project documents', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
        { id: 'sub1', name: 'Sub1', type: 'sub-diagram', path: 'sub1.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [
            createNode('n1', 'start'),
            createNode('n2', 'sub-diagram-call', { diagramId: 'sub1' }),
          ],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors.some(e => e.type === 'missing_diagram' && e.diagramId === 'sub1')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty diagram', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors).toHaveLength(0);
    });

    test('handles diagram with only start and end nodes', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [createNode('n1', 'start'), createNode('n2', 'end')],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors).toHaveLength(0);
    });

    test('handles self-referencing diagram', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [
            createNode('n1', 'start'),
            createNode('n2', 'sub-diagram-call', { diagramId: 'main' }),
          ],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors.some(e => e.type === 'circular_reference')).toBe(true);
    });

    test('handles multiple start nodes (valid scenario)', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [createNode('n1', 'start'), createNode('n2', 'start'), createNode('n3', 'end')],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors).toHaveLength(0);
    });
  });
});

describe('Validation Error Aggregation', () => {
  test('collects multiple errors from different validation rules', () => {
    const diagrams: DiagramMetadata[] = [
      { id: 'main', name: 'Main', type: 'main', path: 'main.process', createdAt: '', updatedAt: '' },
      {
        id: 'sub1',
        name: 'Sub1',
        type: 'sub-diagram',
        path: 'sub1.process',
        inputs: ['required_param'],
        createdAt: '',
        updatedAt: '',
      },
    ];

    const diagramDocuments: Record<string, DiagramDocument> = {
      main: {
        metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
        nodes: [
          createNode('n1', 'start'),
          createNode('n2', 'sub-diagram-call', { diagramId: 'sub1', parameters: {} }),
          createNode('n3', 'sub-diagram-call', { diagramId: 'nonexistent' }),
        ],
        edges: [],
      },
      sub1: {
        metadata: { id: 'sub1', name: 'Sub1', createdAt: '', updatedAt: '' },
        nodes: [createNode('n4', 'start'), createNode('n5', 'end')],
        edges: [],
      },
    };

    const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.some(e => e.type === 'invalid_parameter')).toBe(true);
    expect(errors.some(e => e.type === 'missing_diagram')).toBe(true);
  });
});
