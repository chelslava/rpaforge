import { describe, expect, test } from 'vitest';
import type { Node } from '@reactflow/core';
import {
  detectCircularReferences,
  validateSubDiagramCall,
  validateParameterMapping,
  getCallHierarchy,
  validateProjectDiagramState,
} from './diagramValidation';
import type { DiagramMetadata } from '../stores/diagramStore';
import type { DiagramDocument } from '../stores/diagramStore';
import type { ProcessNodeData } from '../stores/processStore';

function createNode(
  id: string,
  type: string,
  blockData?: Record<string, unknown>
): Node<ProcessNodeData> {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { blockData: { type, ...blockData } as any },
  } as Node<ProcessNodeData>;
}

describe('diagramValidation', () => {
  describe('detectCircularReferences', () => {
    test('returns null for diagram with no sub-diagram calls', () => {
      const diagrams = new Map<string, DiagramMetadata>([
        ['main', { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' }],
      ]);

      const nodesMap = new Map<string, Node<ProcessNodeData>[]>([
        ['main', [createNode('node-1', 'start')]],
      ]);

      const result = detectCircularReferences('main', diagrams, nodesMap);
      expect(result).toBeNull();
    });

    test('returns null for valid nested sub-diagram calls', () => {
      const diagrams = new Map<string, DiagramMetadata>([
        ['main', { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' }],
        ['sub1', { id: 'sub1', name: 'Sub1', type: 'sub-diagram', path: '', createdAt: '', updatedAt: '' }],
      ]);

      const nodesMap = new Map<string, Node<ProcessNodeData>[]>([
        ['main', [createNode('node-1', 'sub-diagram-call', { diagramId: 'sub1' })]],
        ['sub1', [createNode('node-2', 'end')]],
      ]);

      const result = detectCircularReferences('main', diagrams, nodesMap);
      expect(result).toBeNull();
    });

    test('detects direct circular reference', () => {
      const diagrams = new Map<string, DiagramMetadata>([
        ['main', { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' }],
        ['sub1', { id: 'sub1', name: 'Sub1', type: 'sub-diagram', path: '', createdAt: '', updatedAt: '' }],
      ]);

      const nodesMap = new Map<string, Node<ProcessNodeData>[]>([
        ['main', [createNode('node-1', 'sub-diagram-call', { diagramId: 'sub1' })]],
        ['sub1', [createNode('node-2', 'sub-diagram-call', { diagramId: 'main' })]],
      ]);

      const result = detectCircularReferences('main', diagrams, nodesMap);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('circular_reference');
    });

    test('detects indirect circular reference', () => {
      const diagrams = new Map<string, DiagramMetadata>([
        ['main', { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' }],
        ['sub1', { id: 'sub1', name: 'Sub1', type: 'sub-diagram', path: '', createdAt: '', updatedAt: '' }],
        ['sub2', { id: 'sub2', name: 'Sub2', type: 'sub-diagram', path: '', createdAt: '', updatedAt: '' }],
      ]);

      const nodesMap = new Map<string, Node<ProcessNodeData>[]>([
        ['main', [createNode('node-1', 'sub-diagram-call', { diagramId: 'sub1' })]],
        ['sub1', [createNode('node-2', 'sub-diagram-call', { diagramId: 'sub2' })]],
        ['sub2', [createNode('node-3', 'sub-diagram-call', { diagramId: 'main' })]],
      ]);

      const result = detectCircularReferences('main', diagrams, nodesMap);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('circular_reference');
    });
  });

  describe('validateSubDiagramCall', () => {
    test('returns null for non-sub-diagram-call node', () => {
      const node = createNode('node-1', 'start');

      const diagrams: DiagramMetadata[] = [];
      const result = validateSubDiagramCall(node, diagrams);
      expect(result).toBeNull();
    });

    test('returns error for missing diagram', () => {
      const node = createNode('node-1', 'sub-diagram-call', { diagramId: 'missing' });

      const diagrams: DiagramMetadata[] = [
        { id: 'other', name: 'Other', type: 'sub-diagram', path: '', createdAt: '', updatedAt: '' },
      ];

      const result = validateSubDiagramCall(node, diagrams);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('missing_diagram');
    });
  });

  describe('validateParameterMapping', () => {
    test('returns error for missing required parameter', () => {
      const node = createNode('node-1', 'sub-diagram-call', { parameters: {} });

      const diagram: DiagramMetadata = {
        id: 'sub1',
        name: 'Sub1',
        type: 'sub-diagram',
        path: '',
        inputs: ['username', 'password'],
        createdAt: '',
        updatedAt: '',
      };

      const result = validateParameterMapping(node, diagram);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('invalid_parameter');
    });

    test('returns null when all required parameters are provided', () => {
      const node = createNode('node-1', 'sub-diagram-call', {
        parameters: { username: '${user}', password: '${pass}' },
      });

      const diagram: DiagramMetadata = {
        id: 'sub1',
        name: 'Sub1',
        type: 'sub-diagram',
        path: '',
        inputs: ['username', 'password'],
        createdAt: '',
        updatedAt: '',
      };

      const result = validateParameterMapping(node, diagram);
      expect(result).toBeNull();
    });
  });

  describe('getCallHierarchy', () => {
    test('returns hierarchy for nested calls', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' },
        { id: 'sub1', name: 'Sub1', type: 'sub-diagram', path: '', createdAt: '', updatedAt: '' },
      ];

      const nodesMap = new Map<string, Node<ProcessNodeData>[]>([
        ['main', [createNode('node-1', 'sub-diagram-call', { diagramId: 'sub1' })]],
        ['sub1', [createNode('node-2', 'end')]],
      ]);

      const hierarchy = getCallHierarchy('main', diagrams, nodesMap);
      expect(hierarchy).toHaveLength(2);
      expect(hierarchy[0].name).toBe('Main');
      expect(hierarchy[1].name).toBe('Sub1');
    });
  });

  describe('validateProjectDiagramState', () => {
    test('validates parameter mappings against target sub-diagrams across project documents', () => {
      const diagrams: DiagramMetadata[] = [
        { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' },
        {
          id: 'login',
          name: 'Login Flow',
          type: 'sub-diagram',
          path: '',
          inputs: ['username'],
          outputs: ['success'],
          createdAt: '',
          updatedAt: '',
        },
      ];

      const diagramDocuments: Record<string, DiagramDocument> = {
        main: {
          metadata: { id: 'main', name: 'Main', createdAt: '', updatedAt: '' },
          nodes: [createNode('node-1', 'sub-diagram-call', { diagramId: 'login', parameters: {} })],
          edges: [],
        },
        login: {
          metadata: { id: 'login', name: 'Login Flow', createdAt: '', updatedAt: '' },
          nodes: [createNode('node-2', 'end')],
          edges: [],
        },
      };

      const errors = validateProjectDiagramState('main', diagrams, diagramDocuments);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'invalid_parameter',
            message: 'Missing required parameter: username',
          }),
        ])
      );
    });
  });
});
