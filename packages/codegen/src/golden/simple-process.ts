import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';

export const nodes: RpaNode<any>[] = [
  {
    id: 'n1',
    data: {
      blockData: {
        type: 'start',
        processName: 'Simple Process',
      },
    },
    position: { x: 100, y: 100 },
  },
  {
    id: 'n2',
    data: {
      blockData: {
        type: 'activity',
        library: 'BuiltIn',
        activityId: 'Log',
        name: 'Log',
      },
      activityValues: {
        message: 'Hello, World!',
      },
    },
    position: { x: 300, y: 100 },
  },
  {
    id: 'n3',
    data: {
      blockData: {
        type: 'end',
      },
    },
    position: { x: 500, y: 100 },
  },
];

export const edges: RpaEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
];
