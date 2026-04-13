import type { Activity } from '../../types/engine';

export const BUILTIN_ACTIVITIES: Activity[] = [
  {
    id: 'builtin.start',
    name: 'Start',
    type: 'sync',
    category: 'Flow',
    description: 'Start point of the diagram',
    library: 'BuiltIn',
    tags: ['flow-control'],
    timeout_ms: 0,
    has_retry: false,
    has_continue_on_error: false,
    params: [],
  },
  {
    id: 'builtin.end',
    name: 'End',
    type: 'sync',
    category: 'Flow',
    description: 'End point of the diagram',
    library: 'BuiltIn',
    tags: ['flow-control'],
    timeout_ms: 0,
    has_retry: false,
    has_continue_on_error: false,
    params: [],
  },
  {
    id: 'builtin.sub_diagram',
    name: 'Call Diagram',
    type: 'sub_diagram',
    category: 'Flow',
    description: 'Call a sub-diagram with parameters',
    library: 'BuiltIn',
    tags: ['flow-control', 'sub-diagram'],
    timeout_ms: 30000,
    has_retry: false,
    has_continue_on_error: false,
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
  },
  {
    id: 'builtin.comment',
    name: 'Comment',
    type: 'sync',
    category: 'Flow',
    description: 'Add a comment to the diagram (does not execute)',
    library: 'BuiltIn',
    tags: ['flow-control'],
    timeout_ms: 0,
    has_retry: false,
    has_continue_on_error: false,
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
