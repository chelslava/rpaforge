import { describe, expect, test } from 'vitest';
import {
  detectCircularReferences,
  validateSubDiagramCall,
  validateParameterMapping,
  getCallHierarchy,
} from './diagramValidation';
import type { DiagramMetadata } from '../stores/diagramStore';
import type { Node, ProcessNodeData } from '../stores/processStore';

describe('diagramValidation', () => {
  describe('detectCircularReferences', () => {
    test('returns null for diagram with no sub-diagram calls', () => {
      const diagrams = new Map<string, DiagramMetadata>([
        ['main', { id: 'main', name: 'Main', type: 'main', path: '', createdAt: '', updatedAt: '' }],
      ]);

      const nodesMap = new Map<string, Node<ProcessNodeData>[]>([
        ['main', [{ id: 'node-1', type: 'start', position: { x: 0, y: 0 }, data: {} }]],
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
        [
          'main',
          [
            {
              id: 'node-1',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'sub1' } },
            },
          ],
        ],
        ['sub1', [{ id: 'node-2', type: 'end', position: { x: 0, y: 0 }, data: {} }]],
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
        [
          'main',
          [
            {
              id: 'node-1',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'sub1' } },
            },
          ],
        ],
        [
          'sub1',
          [
            {
              id: 'node-2',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'main' } },
            },
          ],
        ],
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
        [
          'main',
          [
            {
              id: 'node-1',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'sub1' } },
            },
          ],
        ],
        [
          'sub1',
          [
            {
              id: 'node-2',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'sub2' } },
            },
          ],
        ],
        [
          'sub2',
          [
            {
              id: 'node-3',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'main' } },
            },
          ],
        ],
      ]);

      const result = detectCircularReferences('main', diagrams, nodesMap);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('circular_reference');
    });
  });

  describe('validateSubDiagramCall', () => {
    test('returns null for non-sub-diagram-call node', () => {
      const node = {
        id: 'node-1',
        type: 'start',
        position: { x: 0, y: 0 },
        data: { blockData: { type: 'start' } },
      } as Node<ProcessNodeData>;

      const diagrams: DiagramMetadata[] = [];
      const result = validateSubDiagramCall(node, diagrams);
      expect(result).toBeNull();
    });

    test('returns error for missing diagram', () => {
      const node = {
        id: 'node-1',
        type: 'sub-diagram-call',
        position: { x: 0, y: 0 },
        data: { blockData: { type: 'sub-diagram-call', diagramId: 'missing' } },
      } as Node<ProcessNodeData>;

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
      const node = {
        id: 'node-1',
        type: 'sub-diagram-call',
        position: { x: 0, y: 0 },
        data: { blockData: { type: 'sub-diagram-call', parameters: {} } },
      } as Node<ProcessNodeData>;

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
      const node = {
        id: 'node-1',
        type: 'sub-diagram-call',
        position: { x: 0, y: 0 },
        data: { blockData: { type: 'sub-diagram-call', parameters: { username: '${user}', password: '${pass}' } } },
      } as Node<ProcessNodeData>;

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
        [
          'main',
          [
            {
              id: 'node-1',
              type: 'sub-diagram-call',
              position: { x: 0, y: 0 },
              data: { blockData: { type: 'sub-diagram-call', diagramId: 'sub1' } },
            },
          ],
        ],
        ['sub1', [{ id: 'node-2', type: 'end', position: { x: 0, y: 0 }, data: {} }]],
      ]);

      const hierarchy = getCallHierarchy('main', diagrams, nodesMap);
      expect(hierarchy).toHaveLength(2);
      expect(hierarchy[0].name).toBe('Main');
      expect(hierarchy[1].name).toBe('Sub1');
    });
  });
});
