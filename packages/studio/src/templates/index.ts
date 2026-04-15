import type { Edge, Node } from '@reactflow/core';
import type { BlockData, BlockType } from '../types/blocks';
import type { ProcessMetadata } from '../stores/processStore';

export type TemplateType = 'project' | 'process';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  icon: string;
  category: 'empty' | 'simple' | 'framework';
}

export interface TemplateNode {
  id: string;
  type: BlockType | 'activity';
  position: { x: number; y: number };
  data: Partial<BlockData> & {
    activity?: {
      library: string;
      name: string;
      params: Record<string, unknown>;
    };
  };
}

export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface TemplateSubDiagram {
  id: string;
  name: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

export interface ProjectTemplate {
  metadata: TemplateMetadata;
  mainProcess: {
    nodes: TemplateNode[];
    edges: TemplateEdge[];
  };
  subDiagrams?: TemplateSubDiagram[];
  variables?: Record<string, unknown>;
}

export interface ProcessTemplate {
  metadata: TemplateMetadata;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

function createNodeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    metadata: {
      id: 'empty',
      name: 'Empty Project',
      description: 'Start with a blank project containing only a Start node',
      type: 'project',
      icon: 'FiFile',
      category: 'empty',
    },
    mainProcess: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 100 },
          data: { type: 'start', processName: 'Main Process' },
        },
      ],
      edges: [],
    },
  },
  {
    metadata: {
      id: 'simple-sequence',
      name: 'Simple Sequence',
      description: 'Basic linear process with Start, activities, and End',
      type: 'project',
      icon: 'FiArrowDown',
      category: 'simple',
    },
    mainProcess: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 100 },
          data: { type: 'start', processName: 'Main Process' },
        },
        {
          id: 'delay',
          type: 'activity',
          position: { x: 350, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'Flow',
              name: 'Delay',
              params: { duration: '1s' },
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 600, y: 100 },
          data: { type: 'end', status: 'PASS' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'delay' },
        { id: 'e2', source: 'delay', target: 'end' },
      ],
    },
  },
  {
    metadata: {
      id: 'reframework',
      name: 'REFramework',
      description: 'Robotic Enterprise Framework with Excel queue, error handling, and retry logic',
      type: 'project',
      icon: 'FiRepeat',
      category: 'framework',
    },
    mainProcess: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 200 },
          data: { type: 'start', processName: 'REFramework Main' },
        },
        {
          id: 'init-settings',
          type: 'activity',
          position: { x: 300, y: 200 },
          data: {
            type: 'activity',
            activity: {
              library: 'File',
              name: 'Read File',
              params: { path: 'config/settings.json' },
            },
          },
        },
        {
          id: 'init-queue',
          type: 'activity',
          position: { x: 500, y: 200 },
          data: {
            type: 'activity',
            activity: {
              library: 'Excel',
              name: 'Open Workbook',
              params: { path: 'data/queue.xlsx' },
            },
          },
        },
        {
          id: 'read-queue',
          type: 'activity',
          position: { x: 700, y: 200 },
          data: {
            type: 'activity',
            activity: {
              library: 'Excel',
              name: 'Read Range',
              params: { sheet: 'Queue', range: 'A1:Z1000' },
            },
          },
        },
        {
          id: 'process-loop',
          type: 'for-each',
          position: { x: 950, y: 200 },
          data: {
            type: 'for-each',
            itemVariable: 'queueItem',
            collection: 'queueItems',
          },
        },
        {
          id: 'try-process',
          type: 'try-catch',
          position: { x: 1200, y: 200 },
          data: { type: 'try-catch', exceptBlocks: [] },
        },
        {
          id: 'process-item',
          type: 'activity',
          position: { x: 1450, y: 200 },
          data: {
            type: 'activity',
            activity: {
              library: 'Flow',
              name: 'Comment',
              params: { text: 'Process queue item here' },
            },
          },
        },
        {
          id: 'set-success',
          type: 'activity',
          position: { x: 1700, y: 200 },
          data: {
            type: 'activity',
            activity: {
              library: 'Variables',
              name: 'Set Variable',
              params: { name: 'itemStatus', value: 'Success' },
            },
          },
        },
        {
          id: 'close-excel',
          type: 'activity',
          position: { x: 1950, y: 200 },
          data: {
            type: 'activity',
            activity: {
              library: 'Excel',
              name: 'Close Workbook',
              params: { save: true },
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 2150, y: 200 },
          data: { type: 'end', status: 'PASS' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'init-settings' },
        { id: 'e2', source: 'init-settings', target: 'init-queue' },
        { id: 'e3', source: 'init-queue', target: 'read-queue' },
        { id: 'e4', source: 'read-queue', target: 'process-loop' },
        { id: 'e5', source: 'process-loop', target: 'try-process', sourceHandle: 'body' },
        { id: 'e6', source: 'process-loop', target: 'close-excel', sourceHandle: 'next' },
        { id: 'e7', source: 'try-process', target: 'process-item' },
        { id: 'e8', source: 'process-item', target: 'set-success' },
        { id: 'e9', source: 'set-success', target: 'process-loop' },
        { id: 'e13', source: 'close-excel', target: 'end' },
      ],
    },
    subDiagrams: [
      {
        id: 'init',
        name: 'Initialize',
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 100 },
            data: { type: 'start', processName: 'Initialize' },
          },
          {
            id: 'init-activity',
            type: 'activity',
            position: { x: 350, y: 100 },
            data: {
              type: 'activity',
              activity: {
                library: 'Flow',
                name: 'Comment',
                params: { text: 'Initialize application here' },
              },
            },
          },
          {
            id: 'end',
            type: 'end',
            position: { x: 600, y: 100 },
            data: { type: 'end', status: 'PASS' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'init-activity' },
          { id: 'e2', source: 'init-activity', target: 'end' },
        ],
      },
      {
        id: 'process',
        name: 'Process Item',
        nodes: [
          {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 100 },
            data: { type: 'start', processName: 'Process Item' },
          },
          {
            id: 'process-activity',
            type: 'activity',
            position: { x: 350, y: 100 },
            data: {
              type: 'activity',
              activity: {
                library: 'Flow',
                name: 'Comment',
                params: { text: 'Process single queue item' },
              },
            },
          },
          {
            id: 'end',
            type: 'end',
            position: { x: 600, y: 100 },
            data: { type: 'end', status: 'PASS' },
          },
        ],
        edges: [
          { id: 'e1', source: 'start', target: 'process-activity' },
          { id: 'e2', source: 'process-activity', target: 'end' },
        ],
      },
    ],
    variables: {
      queueItems: [],
      currentItem: null,
      itemStatus: '',
      errorMessage: '',
      successCount: 0,
      failedCount: 0,
    },
  },
];

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    metadata: {
      id: 'empty-process',
      name: 'Empty Process',
      description: 'A blank process with just a Start node',
      type: 'process',
      icon: 'FiFile',
      category: 'empty',
    },
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 100, y: 100 },
        data: { type: 'start', processName: 'New Process' },
      },
    ],
    edges: [],
  },
  {
    metadata: {
      id: 'linear-process',
      name: 'Linear Process',
      description: 'Simple start-to-end linear workflow',
      type: 'process',
      icon: 'FiArrowRight',
      category: 'simple',
    },
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 100, y: 100 },
        data: { type: 'start', processName: 'Linear Process' },
      },
      {
        id: 'activity1',
        type: 'activity',
        position: { x: 350, y: 100 },
        data: {
          type: 'activity',
          activity: {
            library: 'Flow',
            name: 'Comment',
            params: { text: 'Add your activities here' },
          },
        },
      },
      {
        id: 'end',
        type: 'end',
        position: { x: 600, y: 100 },
        data: { type: 'end', status: 'PASS' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'activity1' },
      { id: 'e2', source: 'activity1', target: 'end' },
    ],
  },
  {
    metadata: {
      id: 'retry-process',
      name: 'Retry Pattern',
      description: 'Process with retry logic for resilient execution',
      type: 'process',
      icon: 'FiRefreshCw',
      category: 'framework',
    },
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 100, y: 150 },
        data: { type: 'start', processName: 'Retry Process' },
      },
      {
        id: 'retry',
        type: 'retry-scope',
        position: { x: 350, y: 150 },
        data: { type: 'retry-scope', retryCount: 3, retryInterval: '2s' },
      },
      {
        id: 'activity',
        type: 'activity',
        position: { x: 600, y: 150 },
        data: {
          type: 'activity',
          activity: {
            library: 'Flow',
            name: 'Comment',
            params: { text: 'Activity with retry logic' },
          },
        },
      },
      {
        id: 'end',
        type: 'end',
        position: { x: 850, y: 150 },
        data: { type: 'end', status: 'PASS' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'retry' },
      { id: 'e2', source: 'retry', target: 'activity', sourceHandle: 'output' },
      { id: 'e3', source: 'activity', target: 'end' },
    ],
  },
  {
    metadata: {
      id: 'try-catch-process',
      name: 'Try-Catch Pattern',
      description: 'Process with error handling and graceful failure',
      type: 'process',
      icon: 'FiAlertCircle',
      category: 'framework',
    },
    nodes: [
      {
        id: 'start',
        type: 'start',
        position: { x: 100, y: 150 },
        data: { type: 'start', processName: 'Try-Catch Process' },
      },
      {
        id: 'try-catch',
        type: 'try-catch',
        position: { x: 350, y: 150 },
        data: { type: 'try-catch', exceptBlocks: [] },
      },
      {
        id: 'try-activity',
        type: 'activity',
        position: { x: 600, y: 150 },
        data: {
          type: 'activity',
          activity: {
            library: 'Flow',
            name: 'Comment',
            params: { text: 'Main activity (may throw)' },
          },
        },
      },
      {
        id: 'end',
        type: 'end',
        position: { x: 850, y: 150 },
        data: { type: 'end', status: 'PASS' },
      },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'try-catch' },
      { id: 'e2', source: 'try-catch', target: 'try-activity' },
      { id: 'e4', source: 'try-activity', target: 'end' },
    ],
  },
];

export function instantiateProjectTemplate(
  template: ProjectTemplate,
  projectName: string
): {
  metadata: ProcessMetadata;
  nodes: Node[];
  edges: Edge[];
  subDiagrams?: Record<string, { metadata: ProcessMetadata; nodes: Node[]; edges: Edge[] }>;
  variables?: Record<string, unknown>;
} {
  const timestamp = new Date().toISOString();
  const mainId = createNodeId('main');

  const mainMetadata: ProcessMetadata = {
    id: mainId,
    name: 'Main Process',
    description: `Main process for ${projectName}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const mainNodes = template.mainProcess.nodes.map((node) => ({
    id: node.id === 'start' ? mainId : createNodeId(node.id),
    type: node.type,
    position: node.position,
    data: {
      blockData: node.data as BlockData,
      activity: node.data.activity
        ? {
            id: `${node.data.activity.library}.${node.data.activity.name}`,
            name: node.data.activity.name,
            library: node.data.activity.library,
            params: [],
            category: '',
            description: '',
            tags: [],
            type: 'sync' as const,
            timeout_ms: 30000,
            has_retry: false,
            has_continue_on_error: false,
            has_output: false,
          }
        : undefined,
      activityValues: node.data.activity?.params || {},
    },
  }));

  const nodeIdMap = new Map<string, string>();
  template.mainProcess.nodes.forEach((node, i) => {
    nodeIdMap.set(node.id, mainNodes[i].id);
  });

  const mainEdges = template.mainProcess.edges.map((edge) => ({
    id: createNodeId('e'),
    source: nodeIdMap.get(edge.source) || edge.source,
    target: nodeIdMap.get(edge.target) || edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: 'default' as const,
  }));

  const subDiagrams: Record<string, { metadata: ProcessMetadata; nodes: Node[]; edges: Edge[] }> | undefined =
    template.subDiagrams
      ? Object.fromEntries(
          template.subDiagrams.map((sub) => {
            const subId = createNodeId(sub.id);
            const subMetadata: ProcessMetadata = {
              id: subId,
              name: sub.name,
              createdAt: timestamp,
              updatedAt: timestamp,
            };

            const subNodes = sub.nodes.map((node) => ({
              id: node.id === 'start' ? subId : createNodeId(node.id),
              type: node.type,
              position: node.position,
              data: {
                blockData: node.data as BlockData,
                activity: node.data.activity
                  ? {
                      id: `${node.data.activity.library}.${node.data.activity.name}`,
                      name: node.data.activity.name,
                      library: node.data.activity.library,
                      params: [],
                      category: '',
                      description: '',
                      tags: [],
                      type: 'sync' as const,
                      timeout_ms: 30000,
                      has_retry: false,
                      has_continue_on_error: false,
                      has_output: false,
                    }
                  : undefined,
                activityValues: node.data.activity?.params || {},
              },
            }));

            const subNodeIdMap = new Map<string, string>();
            sub.nodes.forEach((node, i) => {
              subNodeIdMap.set(node.id, subNodes[i].id);
            });

            const subEdges = sub.edges.map((edge) => ({
              id: createNodeId('e'),
              source: subNodeIdMap.get(edge.source) || edge.source,
              target: subNodeIdMap.get(edge.target) || edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              type: 'default' as const,
            }));

            return [subId, { metadata: subMetadata, nodes: subNodes, edges: subEdges }];
          })
        )
      : undefined;

  return {
    metadata: mainMetadata,
    nodes: mainNodes,
    edges: mainEdges,
    subDiagrams,
    variables: template.variables,
  };
}

export function getProjectTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.metadata.id === id);
}

export function getProcessTemplateById(id: string): ProcessTemplate | undefined {
  return PROCESS_TEMPLATES.find((t) => t.metadata.id === id);
}
