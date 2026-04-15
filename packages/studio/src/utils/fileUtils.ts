import type { Node, Edge } from '@reactflow/core';
import type { ProcessNodeData, ProcessMetadata } from '../stores/processStore';
import type { DiagramDocument, ProjectConfig } from '../stores/diagramStore';
import { createLogger } from './logger';

export const PROCESS_EXTENSION = '.process';
export const PROJECT_EXTENSION = '.rpaforge';

const PROCESS_FORMAT_VERSION = '1.0.0';
const PROJECT_FORMAT_VERSION = '1.0.0';
const logger = createLogger('fileUtils');

export interface ProcessFile {
  version: string;
  exportedAt: string;
  metadata: ProcessMetadata;
  nodes: Node<ProcessNodeData>[];
  edges: Edge[];
  viewport?: { x: number; y: number; zoom: number };
}

export type DiagramExport = ProcessFile;

export interface DiagramImportResult {
  success: boolean;
  diagram?: ProcessFile;
  error?: string;
}

export interface ProjectFile {
  version: string;
  exportedAt: string;
  project: ProjectConfig;
  diagrams: Record<string, DiagramDocument>;
}

export type ProjectExport = ProjectFile;

export interface ProjectImportResult {
  success: boolean;
  project?: ProjectFile;
  error?: string;
}

export function serializeDiagram(
  nodes: Node<ProcessNodeData>[],
  edges: Edge[],
  metadata: ProcessMetadata,
  viewport?: { x: number; y: number; zoom: number }
): string {
  const exportData: ProcessFile = {
    version: PROCESS_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    metadata,
    nodes,
    edges,
    viewport,
  };
  return JSON.stringify(exportData, null, 2);
}

export const serializeProcess = serializeDiagram;

export function deserializeDiagram(json: string): DiagramImportResult {
  try {
    const data = JSON.parse(json) as ProcessFile;

    if (!data.version || !data.nodes || !data.edges) {
      return { success: false, error: 'Invalid process file format' };
    }

    if (data.version !== PROCESS_FORMAT_VERSION) {
      logger.warn(
        `Process file version ${data.version} may not be fully compatible with current version ${PROCESS_FORMAT_VERSION}`
      );
    }

    return { success: true, diagram: data };
  } catch (e) {
    return { success: false, error: `Failed to parse process file: ${e}` };
  }
}

export const deserializeProcess = deserializeDiagram;

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
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return ext === PROCESS_EXTENSION;
}

export function isValidProcessFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return ext === PROCESS_EXTENSION;
}

export function serializeProject(
  project: ProjectConfig,
  diagrams: Record<string, DiagramDocument>
): string {
  const exportData: ProjectFile = {
    version: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    diagrams,
  };
  return JSON.stringify(exportData, null, 2);
}

export function deserializeProject(json: string): ProjectImportResult {
  try {
    const data = JSON.parse(json) as ProjectFile;

    if (!data.version || !data.project || !data.diagrams) {
      return { success: false, error: 'Invalid project file format' };
    }

    if (data.version !== PROJECT_FORMAT_VERSION) {
      logger.warn(
        `Project file version ${data.version} may not be fully compatible with current version ${PROJECT_FORMAT_VERSION}`
      );
    }

    return { success: true, project: data };
  } catch (e) {
    return { success: false, error: `Failed to parse project file: ${e}` };
  }
}

export function isValidProjectFile(file: File): boolean {
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  return ext === PROJECT_EXTENSION;
}

export function generateProjectFilename(projectName: string): string {
  const sanitized = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${sanitized}${PROJECT_EXTENSION}`;
}

export function generateProcessFilename(processName: string): string {
  const sanitized = processName.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${sanitized}${PROCESS_EXTENSION}`;
}
