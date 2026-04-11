import type { Activity } from '../../types/engine';

export const BUILTIN_ACTIVITIES: Activity[] = [
  {
    id: 'builtin.start',
    name: 'Start',
    type: 'sync',
    category: 'Flow',
    description: 'Start point of the diagram',
    icon: '▶',
    library: 'BuiltIn',
    ports: {
      inputs: [],
      outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
    },
    params: [],
    builtin: {
      timeout: false,
      retry: false,
      continueOnError: false,
      nested: false,
    },
    robotFramework: {
      keyword: 'NoOperation',
      library: 'BuiltIn',
    },
  },
  {
    id: 'builtin.end',
    name: 'End',
    type: 'sync',
    category: 'Flow',
    description: 'End point of the diagram',
    icon: '■',
    library: 'BuiltIn',
    ports: {
      inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
      outputs: [],
    },
    params: [],
    builtin: {
      timeout: false,
      retry: false,
      continueOnError: false,
      nested: false,
    },
    robotFramework: {
      keyword: 'NoOperation',
      library: 'BuiltIn',
    },
  },
  {
    id: 'builtin.sub_diagram',
    name: 'Call Diagram',
    type: 'sub_diagram',
    category: 'Flow',
    description: 'Call a sub-diagram with parameters',
    icon: '📞',
    library: 'BuiltIn',
    ports: {
      inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
      outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
    },
    params: [
      {
        name: 'diagramId',
        type: 'string',
        label: 'Diagram',
        description: 'Sub-diagram to call',
        required: true,
        options: [],
      },
      {
        name: 'parameters',
        type: 'dict',
        label: 'Parameters',
        description: 'Input parameters for the sub-diagram',
        required: false,
        options: [],
      },
    ],
    builtin: {
      timeout: true,
      retry: false,
      continueOnError: false,
      nested: true,
    },
    robotFramework: {
      keyword: 'Run Keyword',
      library: 'BuiltIn',
    },
  },
  {
    id: 'builtin.comment',
    name: 'Comment',
    type: 'sync',
    category: 'Flow',
    description: 'Add a comment to the diagram (does not execute)',
    icon: '💬',
    library: 'BuiltIn',
    ports: {
      inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
      outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
    },
    params: [
      {
        name: 'text',
        type: 'string',
        label: 'Comment',
        description: 'Comment text',
        required: true,
        options: [],
      },
    ],
    builtin: {
      timeout: false,
      retry: false,
      continueOnError: false,
      nested: false,
    },
    robotFramework: {
      keyword: 'NoOperation',
      library: 'BuiltIn',
    },
  },
];

export function getBuiltinActivity(id: string): Activity | undefined {
  return BUILTIN_ACTIVITIES.find((a) => a.id === id);
}

export function isBuiltinActivity(id: string): boolean {
  return id.startsWith('builtin.');
}

export function isSubDiagramActivity(activity: Activity): boolean {
  return activity.type === 'sub_diagram';
}
