import type { Node, Edge } from '@reactflow/core';
import type { ProcessMetadata, ProcessNodeData } from '../stores/processStore';
import type { DiagramType } from '../stores/diagramStore';
import type { BlockData, BlockType } from '../types/blocks';

export interface ProcessTemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: 'empty' | 'simple' | 'framework';
  icon?: string;
}

export interface ProcessTemplateFile {
  version: string;
  templateType: 'process';
  metadata: ProcessTemplateMetadata;
  diagram: {
    nodes: TemplateNode[];
    edges: TemplateEdge[];
  };
}

export interface ProjectTemplateMetadata {
  id: string;
  name: string;
  description: string;
  category: 'empty' | 'simple' | 'framework';
  icon?: string;
}

export interface ProjectDiagramReference {
  path: string;
  type: DiagramType;
  name: string;
  folder?: string;
}

export interface ProjectTemplateFile {
  version: string;
  templateType: 'project';
  metadata: ProjectTemplateMetadata;
  project: {
    name: string;
    version: string;
    settings: {
      defaultTimeout: number;
      screenshotOnError: boolean;
    };
  };
  diagrams: ProjectDiagramReference[];
  folders?: string[];
}

export interface TemplateNode {
  id: string;
  type: BlockType;
  position: { x: number; y: number };
  data: {
    blockData: Partial<BlockData>;
    activityValues?: Record<string, unknown>;
  };
}

export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

export interface LoadedProcessTemplate {
  metadata: ProcessTemplateMetadata;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
}

export interface LoadedProjectTemplate {
  metadata: ProjectTemplateMetadata;
  project: ProjectTemplateFile['project'];
  diagrams: Array<{
    id: string;
    name: string;
    type: DiagramType;
    nodes: Node<ProcessNodeData>[];
    edges: Edge[];
    isMain: boolean;
  }>;
}

const TEMPLATE_VERSION = '1.0.0';

function generateId(prefix: string = 'node'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createNodeIdMap(templateNodes: TemplateNode[]): Map<string, string> {
  const idMap = new Map<string, string>();
  templateNodes.forEach((node) => {
    idMap.set(node.id, generateId(node.type));
  });
  return idMap;
}

function transformTemplateNode(
  node: TemplateNode,
  idMap: Map<string, string>,
  processName: string
): Node<ProcessNodeData> {
  const newId = idMap.get(node.id) || generateId();
  const blockData = {
    ...node.data.blockData,
    id: newId,
    type: node.type,
    name: node.data.blockData.name || node.type,
    label: node.data.blockData.label || node.type,
    processName: node.type === 'start' ? processName : undefined,
  } as BlockData;

  return {
    id: newId,
    type: node.type,
    position: node.position,
    data: {
      blockData,
      activityValues: node.data.activityValues || {},
    },
  };
}

function transformTemplateEdges(
  edges: TemplateEdge[],
  idMap: Map<string, string>
): Edge[] {
  return edges.map((edge, index) => ({
    id: edge.id || `e_${index}_${Date.now()}`,
    source: idMap.get(edge.source) || edge.source,
    target: idMap.get(edge.target) || edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: 'default' as const,
  }));
}

export function parseProcessTemplate(json: string): LoadedProcessTemplate | null {
  try {
    const template = JSON.parse(json) as ProcessTemplateFile;

    if (template.templateType !== 'process' || !template.diagram) {
      return null;
    }

    const idMap = createNodeIdMap(template.diagram.nodes);
    const processName = template.metadata.name;

    const nodes = template.diagram.nodes.map((node) =>
      transformTemplateNode(node, idMap, processName)
    );

    const edges = transformTemplateEdges(template.diagram.edges, idMap);

    return {
      metadata: template.metadata,
      nodes,
      edges,
    };
  } catch {
    return null;
  }
}

export function parseProjectTemplate(json: string): ProjectTemplateFile | null {
  try {
    const template = JSON.parse(json) as ProjectTemplateFile;

    if (template.templateType !== 'project' || !template.diagrams) {
      return null;
    }

    return template;
  } catch {
    return null;
  }
}

export function instantiateProcessTemplate(
  template: LoadedProcessTemplate,
  processName: string
): {
  metadata: ProcessMetadata;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
} {
  const timestamp = new Date().toISOString();
  const idMap = createNodeIdMap(
    template.nodes.map((n) => ({
      id: n.id,
      type: n.type as BlockType,
      position: n.position,
      data: { blockData: n.data.blockData as Partial<BlockData> },
    }))
  );

  const nodes = template.nodes.map((node) =>
    transformTemplateNode(
      {
        id: node.id,
        type: node.type as BlockType,
        position: node.position,
        data: {
          blockData: node.data.blockData as Partial<BlockData>,
          activityValues: node.data.activityValues,
        },
      },
      idMap,
      processName
    )
  );

  const edges = transformTemplateEdges(
    template.edges.map((e, i) => ({
      id: e.id || `e_${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
    idMap
  );

  const mainNodeId = nodes.find((n) => n.type === 'start')?.id || generateId('start');

  return {
    metadata: {
      id: mainNodeId,
      name: processName,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    nodes,
    edges,
  };
}

export function instantiateProjectTemplate(
  template: ProjectTemplateFile,
  projectName: string,
  diagramContents: Map<string, LoadedProcessTemplate>
): {
  project: {
    name: string;
    version: string;
    main: string;
    diagrams: Array<{
      id: string;
      name: string;
      type: DiagramType;
      path: string;
      folder?: string;
      createdAt: string;
      updatedAt: string;
    }>;
    folders: string[];
    settings: ProjectTemplateFile['project']['settings'];
  };
  documents: Record<
    string,
    {
      metadata: ProcessMetadata;
      nodes: Node<ProcessNodeData>[];
      edges: Edge[];
    }
  >;
} {
  const timestamp = new Date().toISOString();
  const documents: Record<
    string,
    {
      metadata: ProcessMetadata;
      nodes: Node<ProcessNodeData>[];
      edges: Edge[];
    }
  > = {};

  const diagrams: Array<{
    id: string;
    name: string;
    type: DiagramType;
    path: string;
    folder?: string;
    createdAt: string;
    updatedAt: string;
  }> = [];

  let mainId = '';

  for (const diagramRef of template.diagrams) {
    const diagramTemplate = diagramContents.get(diagramRef.path);
    if (!diagramTemplate) continue;

    const instantiated = instantiateProcessTemplate(diagramTemplate, diagramRef.name);
    const diagramId = instantiated.metadata.id;

    documents[diagramId] = instantiated;

    diagrams.push({
      id: diagramId,
      name: diagramRef.name,
      type: diagramRef.type,
      path: diagramRef.path,
      folder: diagramRef.folder,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (diagramRef.type === 'main') {
      mainId = diagramId;
    }
  }

  return {
    project: {
      name: projectName,
      version: template.project.version,
      main: mainId,
      diagrams,
      folders: template.folders || [],
      settings: template.project.settings,
    },
    documents,
  };
}

export { TEMPLATE_VERSION };
