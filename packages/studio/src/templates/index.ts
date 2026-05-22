import type { Edge, Node } from '@reactflow/core';
import type { BlockData } from '../types/blocks';
import type { ProcessMetadata } from '../stores/processStore';
import type { TemplateType, TemplateMetadata, TemplateNode, TemplateEdge, TemplateSubDiagram, ProjectTemplate, ProcessTemplate, CategoryInfo, MARKETPLACE_CATEGORIES } from '../types/template';

export { TemplateType, TemplateMetadata, TemplateNode, TemplateEdge, TemplateSubDiagram, ProjectTemplate, ProcessTemplate, CategoryInfo, MARKETPLACE_CATEGORIES };

function createNodeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
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
      tags: ['starter', 'blank'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
      tags: ['linear', 'beginner', 'workflow'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
      tags: ['enterprise', 'queue', 'retry', 'error-handling'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
  // Web Automation Template
  {
    metadata: {
      id: 'web-login',
      name: 'Website Login',
      description: 'Automate login to any website using WebUI library with credential handling',
      type: 'project',
      icon: 'FiGlobe',
      category: 'web-automation',
      author: 'RPAForge Team',
      tags: ['web', 'login', 'credentials', 'authentication'],
      version: '1.0.0',
    },
    mainProcess: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 100 },
          data: { type: 'start', processName: 'Website Login' },
        },
        {
          id: 'navigate',
          type: 'activity',
          position: { x: 350, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'WebUI',
              name: 'Navigate',
              params: { url: 'https://example.com/login' },
            },
          },
        },
        {
          id: 'fill-username',
          type: 'activity',
          position: { x: 600, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'WebUI',
              name: 'Fill Text',
              params: { selector: '#username', text: '${username}' },
            },
          },
        },
        {
          id: 'fill-password',
          type: 'activity',
          position: { x: 850, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'WebUI',
              name: 'Fill Text',
              params: { selector: '#password', text: '${password}' },
            },
          },
        },
        {
          id: 'click-login',
          type: 'activity',
          position: { x: 1100, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'WebUI',
              name: 'Click',
              params: { selector: 'button[type="submit"]' },
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 1350, y: 100 },
          data: { type: 'end', status: 'PASS' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'navigate' },
        { id: 'e2', source: 'navigate', target: 'fill-username' },
        { id: 'e3', source: 'fill-username', target: 'fill-password' },
        { id: 'e4', source: 'fill-password', target: 'click-login' },
        { id: 'e5', source: 'click-login', target: 'end' },
      ],
    },
    variables: {
      username: '',
      password: '',
      loginUrl: '',
    },
  },
  // Desktop Excel Automation Template
  {
    metadata: {
      id: 'excel-data-processing',
      name: 'Excel Data Processor',
      description: 'Read, transform and write Excel data with filtering and calculations',
      type: 'project',
      icon: 'FiFile',
      category: 'excel-automation',
      author: 'RPAForge Team',
      tags: ['excel', 'data', 'processing', 'spreadsheet'],
      version: '1.0.0',
    },
    mainProcess: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 150 },
          data: { type: 'start', processName: 'Excel Data Processing' },
        },
        {
          id: 'open',
          type: 'activity',
          position: { x: 350, y: 150 },
          data: {
            type: 'activity',
            activity: {
              library: 'Excel',
              name: 'Open Workbook',
              params: { path: '${inputFile}' },
            },
          },
        },
        {
          id: 'read',
          type: 'activity',
          position: { x: 600, y: 150 },
          data: {
            type: 'activity',
            activity: {
              library: 'Excel',
              name: 'Read Range',
              params: { sheet: 'Sheet1', range: 'A1:Z1000' },
            },
          },
        },
        {
          id: 'process',
          type: 'for-each',
          position: { x: 850, y: 150 },
          data: {
            type: 'for-each',
            itemVariable: 'row',
            collection: 'excelData',
          },
        },
        {
          id: 'calculate',
          type: 'activity',
          position: { x: 1100, y: 150 },
          data: {
            type: 'activity',
            activity: {
              library: 'Variables',
              name: 'Set Variable',
              params: { name: 'total', value: '${total + row.value}' },
            },
          },
        },
        {
          id: 'write',
          type: 'activity',
          position: { x: 1350, y: 150 },
          data: {
            type: 'activity',
            activity: {
              library: 'Excel',
              name: 'Write Range',
              params: { sheet: 'Results', range: 'A1', data: '${processedData}' },
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 1600, y: 150 },
          data: { type: 'end', status: 'PASS' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'open' },
        { id: 'e2', source: 'open', target: 'read' },
        { id: 'e3', source: 'read', target: 'process' },
        { id: 'e4', source: 'process', target: 'calculate', sourceHandle: 'body' },
        { id: 'e5', source: 'calculate', target: 'process' },
        { id: 'e6', source: 'process', target: 'write', sourceHandle: 'next' },
        { id: 'e7', source: 'write', target: 'end' },
      ],
    },
    variables: {
      inputFile: '',
      outputFile: '',
      excelData: [],
      processedData: [],
      total: 0,
    },
  },
  // File Operations Template
  {
    metadata: {
      id: 'file-organizer',
      name: 'File Organizer',
      description: 'Organize files in a folder by extension, date, or custom rules',
      type: 'project',
      icon: 'FiFolder',
      category: 'file-operations',
      author: 'RPAForge Team',
      tags: ['files', 'organization', 'automation'],
      version: '1.0.0',
    },
    mainProcess: {
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 100, y: 100 },
          data: { type: 'start', processName: 'File Organizer' },
        },
        {
          id: 'list',
          type: 'activity',
          position: { x: 350, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'File',
              name: 'List Files',
              params: { path: '${sourceFolder}', pattern: '*.*' },
            },
          },
        },
        {
          id: 'for-each',
          type: 'for-each',
          position: { x: 600, y: 100 },
          data: {
            type: 'for-each',
            itemVariable: 'file',
            collection: 'files',
          },
        },
        {
          id: 'move',
          type: 'activity',
          position: { x: 850, y: 100 },
          data: {
            type: 'activity',
            activity: {
              library: 'File',
              name: 'Move File',
              params: { source: '${file.path}', destination: '${getDestinationFolder(file)}' },
            },
          },
        },
        {
          id: 'end',
          type: 'end',
          position: { x: 1100, y: 100 },
          data: { type: 'end', status: 'PASS' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'list' },
        { id: 'e2', source: 'list', target: 'for-each' },
        { id: 'e3', source: 'for-each', target: 'move', sourceHandle: 'body' },
        { id: 'e4', source: 'move', target: 'for-each' },
        { id: 'e5', source: 'for-each', target: 'end', sourceHandle: 'next' },
      ],
    },
    variables: {
      sourceFolder: '',
      files: [],
      organizedCount: 0,
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
      tags: ['starter', 'blank'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
      tags: ['linear', 'beginner'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
      tags: ['retry', 'resilience', 'error-handling'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
      tags: ['error-handling', 'exceptions', 'robustness'],
      author: 'RPAForge Team',
      version: '1.0.0',
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
