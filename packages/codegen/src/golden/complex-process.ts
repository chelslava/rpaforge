import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';

export const nodes: RpaNode<any>[] = [
  {
    id: 'n1',
    data: {
      blockData: {
        type: 'start',
        processName: 'Complex Process',
      },
    },
    position: { x: 100, y: 100 },
  },
  {
    id: 'n2',
    data: {
      blockData: {
        type: 'if',
        condition: '${status} == "approved"',
      },
    },
    position: { x: 300, y: 100 },
  },
  {
    id: 'n3',
    data: {
      blockData: {
        type: 'activity',
        library: 'BuiltIn',
        activityId: 'Log',
        name: 'Log',
      },
      activityValues: {
        message: 'Approval confirmed',
      },
    },
    position: { x: 500, y: 50 },
  },
  {
    id: 'n4',
    data: {
      blockData: {
        type: 'activity',
        library: 'DesktopUI',
        activityId: 'Open Application',
        name: 'Open Application',
      },
      activityValues: {
        executable: 'notepad.exe',
      },
    },
    position: { x: 500, y: 150 },
  },
  {
    id: 'n5',
    data: {
      blockData: {
        type: 'activity',
        library: 'BuiltIn',
        activityId: 'Log',
        name: 'Log',
      },
      activityValues: {
        message: 'Not approved - opening notepad',
      },
    },
    position: { x: 700, y: 100 },
  },
  {
    id: 'n6',
    data: {
      blockData: {
        type: 'activity',
        library: 'BuiltIn',
        activityId: 'Log',
        name: 'Log',
      },
      activityValues: {
        message: 'Processing complete',
      },
    },
    position: { x: 900, y: 100 },
  },
  {
    id: 'n7',
    data: {
      blockData: {
        type: 'end',
      },
    },
    position: { x: 1100, y: 100 },
  },
];

export const edges: RpaEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3', handle: 'true' },
  { id: 'e3', source: 'n2', target: 'n4', handle: 'false' },
  { id: 'e4', source: 'n3', target: 'n5' },
  { id: 'e5', source: 'n4', target: 'n5' },
  { id: 'e6', source: 'n5', target: 'n6' },
  { id: 'e7', source: 'n6', target: 'n7' },
];
