import type { Node, Edge } from '@reactflow/core';
import type { ProcessNodeData, ProcessMetadata } from '../stores/processStore';
import type { ProjectConfig } from '../stores/diagramStore';

export interface DiagramExport {
  version: string;
  exportedAt: string;
  metadata: ProcessMetadata;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface DiagramImportResult {
  success: boolean;
  diagram?: DiagramExport;
  error?: string;
}

export interface ProjectExport {
  version: string;
  exportedAt: string;
  project: ProjectConfig;
  diagrams: Record<string, DiagramExport>;
}

export interface ProjectImportResult {
  success: boolean;
  project?: ProjectExport;
  error?: string;
}

const CURRENT_VERSION = '1.0.0';
const PROJECT_VERSION = '1.0.0';

export function serializeDiagram(
  nodes: Node<ProcessNodeData>[],
  edges: Edge[],
  metadata: ProcessMetadata,
  viewport?: { x: number; y: number; zoom: number }
): string {
  const exportData: DiagramExport = {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    metadata,
    nodes,
    edges,
    viewport,
  };
  return JSON.stringify(exportData, null, 2);
}

export function deserializeDiagram(json: string): DiagramImportResult {
  try {
    const data = JSON.parse(json) as DiagramExport;

    if (!data.version || !data.nodes || !data.edges) {
      return { success: false, error: 'Invalid diagram format' };
    }

    if (data.version !== CURRENT_VERSION) {
      console.warn(`Diagram version ${data.version} may not be fully compatible with current version ${CURRENT_VERSION}`);
    }

    return { success: true, diagram: data };
  } catch (e) {
    return { success: false, error: `Failed to parse diagram: ${e}` };
  }
}

export function downloadFile(content: string, filename: string, mimeType: string = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function generateFilename(name: string, extension: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${sanitized}_${timestamp}.${extension}`;
}

export function isValidDiagramFile(file: File): boolean {
  const validExtensions = ['.rpaforge', '.json', '.robot'];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return validExtensions.includes(ext);
}

export function serializeProject(
  project: ProjectConfig,
  diagrams: Record<string, DiagramExport>
): string {
  const exportData: ProjectExport = {
    version: PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    diagrams,
  };
  return JSON.stringify(exportData, null, 2);
}

export function deserializeProject(json: string): ProjectImportResult {
  try {
    const data = JSON.parse(json) as ProjectExport;

    if (!data.version || !data.project || !data.diagrams) {
      return { success: false, error: 'Invalid project format' };
    }

    if (data.version !== PROJECT_VERSION) {
      console.warn(`Project version ${data.version} may not be fully compatible with current version ${PROJECT_VERSION}`);
    }

    return { success: true, project: data };
  } catch (e) {
    return { success: false, error: `Failed to parse project: ${e}` };
  }
}

export function isValidProjectFile(file: File): boolean {
  const validExtensions = ['.rpaforge-project', '.rpaforge'];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return validExtensions.includes(ext);
}
