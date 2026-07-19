import type { RpaNode, RpaEdge } from '../types/domain-model';
import type { ProcessNodeData, ProcessMetadata } from '../stores/processStore';
import type { DiagramDocument, DiagramType, ProjectConfig } from '../stores/diagramStore';
import type { ProcessVariable } from '../stores/variableStore';
import Ajv, { type ErrorObject } from 'ajv';
import {
  sanitizeVariableMapForPersistence,
  sanitizeVariablesForPersistence,
} from './secretSerialization';

export const PROCESS_EXTENSION = '.process';
export const PROJECT_EXTENSION = '.rpaforge';

export const LEGACY_FORMAT_VERSION = '1.0.0';
export const CURRENT_FORMAT_VERSION = '1.1.0';
export const PROCESS_FORMAT_VERSION = CURRENT_FORMAT_VERSION;
export const PROJECT_FORMAT_VERSION = CURRENT_FORMAT_VERSION;

const ajv = new Ajv({ allErrors: true, strict: false });

const metadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    createdAt: { type: 'string', minLength: 1 },
    updatedAt: { type: 'string', minLength: 1 },
    orchestratorId: { type: 'string' },
  },
} as const;

const variableSchema = {
  type: 'object',
  required: ['name', 'type', 'value', 'scope'],
  additionalProperties: true,
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', minLength: 1 },
    value: {},
    scope: { enum: ['process', 'task'] },
  },
} as const;

const diagramMetadataSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'type', 'path', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    type: { enum: ['main', 'sub-diagram', 'library'] },
    path: { type: 'string', minLength: 1 },
    inputs: { type: 'array', items: { type: 'string' } },
    outputs: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    folder: { type: 'string' },
    createdAt: { type: 'string', minLength: 1 },
    updatedAt: { type: 'string', minLength: 1 },
  },
} as const;

const processSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'exportedAt', 'metadata', 'nodes', 'edges', 'variables'],
  properties: {
    version: { const: CURRENT_FORMAT_VERSION },
    exportedAt: { type: 'string', minLength: 1 },
    metadata: metadataSchema,
    nodes: { type: 'array', items: { type: 'object' } },
    edges: { type: 'array', items: { type: 'object' } },
    viewport: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'zoom'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        zoom: { type: 'number' },
      },
    },
    variables: { type: 'array', items: variableSchema },
  },
} as const;

const projectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'exportedAt', 'project', 'diagrams'],
  properties: {
    version: { const: CURRENT_FORMAT_VERSION },
    exportedAt: { type: 'string', minLength: 1 },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'version', 'main', 'diagrams', 'folders', 'settings'],
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        main: { type: 'string' },
        diagrams: { type: 'array', items: diagramMetadataSchema },
        folders: { type: 'array', items: { type: 'string' } },
        settings: {
          type: 'object',
          additionalProperties: false,
          required: ['defaultTimeout', 'screenshotOnError'],
          properties: {
            defaultTimeout: { type: 'number' },
            screenshotOnError: { type: 'boolean' },
          },
        },
      },
    },
    diagrams: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['metadata', 'nodes', 'edges'],
        properties: {
          metadata: metadataSchema,
          nodes: { type: 'array', items: { type: 'object' } },
          edges: { type: 'array', items: { type: 'object' } },
          viewport: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'zoom'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              zoom: { type: 'number' },
            },
          },
        },
      },
    },
    variables: {
      type: 'object',
      additionalProperties: { type: 'array', items: variableSchema },
    },
  },
} as const;

const legacyProcessSchema = {
  type: 'object',
  required: ['version'],
  properties: {
    version: { const: LEGACY_FORMAT_VERSION },
    exportedAt: { type: 'string' },
    metadata: {
      type: 'object',
      required: ['id', 'name'],
      additionalProperties: true,
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
      },
    },
    nodes: { type: 'array', items: { type: 'object' } },
    edges: { type: 'array', items: { type: 'object' } },
    diagram: {
      type: 'object',
      required: ['nodes', 'edges'],
      properties: {
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } },
      },
    },
    variables: { type: 'array', items: variableSchema },
  },
} as const;

const historicalProcessSchema = {
  type: 'object',
  required: ['version', 'metadata'],
  anyOf: [
    { required: ['nodes', 'edges'] },
    { required: ['diagram'] },
  ],
  properties: {
    version: { const: CURRENT_FORMAT_VERSION },
    exportedAt: { type: 'string' },
    metadata: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
      },
    },
    nodes: { type: 'array', items: { type: 'object' } },
    edges: { type: 'array', items: { type: 'object' } },
    diagram: {
      type: 'object',
      required: ['nodes', 'edges'],
      properties: {
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } },
      },
    },
    variables: { type: 'array', items: variableSchema },
  },
} as const;

const legacyProjectSchema = {
  type: 'object',
  required: ['version', 'project', 'diagrams'],
  properties: {
    version: { const: LEGACY_FORMAT_VERSION },
    exportedAt: { type: 'string' },
    project: { type: 'object' },
    diagrams: { type: 'object' },
    variables: { type: 'object', additionalProperties: { type: 'array', items: variableSchema } },
  },
} as const;

const projectManifestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'exportedAt', 'project', 'diagrams', 'folders'],
  properties: {
    version: { const: CURRENT_FORMAT_VERSION },
    exportedAt: { type: 'string', minLength: 1 },
    project: projectSchema.properties.project,
    diagrams: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'type', 'name'],
        properties: {
          path: { type: 'string', minLength: 1 },
          type: { enum: ['main', 'sub-diagram', 'library'] },
          name: { type: 'string', minLength: 1 },
          folder: { type: 'string' },
        },
      },
    },
    folders: { type: 'array', items: { type: 'string' } },
    variables: {
      type: 'object',
      additionalProperties: { type: 'array', items: variableSchema },
    },
  },
} as const;

const legacyProjectManifestSchema = {
  type: 'object',
  required: ['version', 'project', 'diagrams'],
  properties: {
    version: { const: LEGACY_FORMAT_VERSION },
    exportedAt: { type: 'string' },
    project: {
      type: 'object',
      required: ['name', 'version', 'settings'],
      properties: {
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        settings: { type: 'object' },
      },
    },
    diagrams: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'type', 'name'],
        properties: {
          path: { type: 'string', minLength: 1 },
          type: { enum: ['main', 'sub-diagram', 'library'] },
          name: { type: 'string', minLength: 1 },
        },
      },
    },
    folders: { type: 'array', items: { type: 'string' } },
    variables: { type: 'object', additionalProperties: { type: 'array', items: variableSchema } },
  },
} as const;

const historicalProjectManifestSchema = {
  type: 'object',
  required: ['version', 'project', 'diagrams'],
  properties: {
    version: { const: CURRENT_FORMAT_VERSION },
    exportedAt: { type: 'string' },
    project: {
      type: 'object',
      required: ['name', 'version', 'settings'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
        settings: { type: 'object' },
      },
    },
    diagrams: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'type', 'name'],
        properties: {
          path: { type: 'string', minLength: 1 },
          type: { enum: ['main', 'sub-diagram', 'library'] },
          name: { type: 'string', minLength: 1 },
        },
      },
    },
    folders: { type: 'array', items: { type: 'string' } },
    variables: { type: 'object', additionalProperties: { type: 'array', items: variableSchema } },
  },
} as const;

const validateProcess = ajv.compile(processSchema);
const validateProject = ajv.compile(projectSchema);
const validateLegacyProcess = ajv.compile(legacyProcessSchema);
const validateHistoricalProcess = ajv.compile(historicalProcessSchema);
const validateLegacyProject = ajv.compile(legacyProjectSchema);
const validateProjectManifest = ajv.compile(projectManifestSchema);
const validateLegacyProjectManifest = ajv.compile(legacyProjectManifestSchema);
const validateHistoricalProjectManifest = ajv.compile(historicalProjectManifestSchema);

function schemaError(errors: ErrorObject[] | null | undefined): string {
  return errors?.map((error) => `${error.instancePath || '/'} ${error.message || 'is invalid'}`).join('; ') || 'schema validation failed';
}

export interface ProcessFile {
  version: string;
  exportedAt: string;
  metadata: ProcessMetadata;
  nodes: RpaNode<ProcessNodeData>[];
  edges: RpaEdge[];
  viewport?: { x: number; y: number; zoom: number };
  variables: ProcessVariable[];
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
  variables?: Record<string, ProcessVariable[]>;
}

export type ProjectExport = ProjectFile;

export interface ProjectManifestFile {
  version: string;
  exportedAt: string;
  project: ProjectConfig;
  diagrams: Array<{
    path: string;
    type: DiagramType;
    name: string;
    folder?: string;
  }>;
  folders: string[];
  variables?: Record<string, ProcessVariable[]>;
}

export interface ProjectImportResult {
  success: boolean;
  project?: ProjectFile;
  error?: string;
}

export interface ProjectManifestResult {
  success: boolean;
  project?: ProjectManifestFile;
  error?: string;
}

const MIGRATION_EPOCH = '1970-01-01T00:00:00.000Z';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeMetadata(value: unknown, fallbackName: string): ProcessMetadata {
  const source = asRecord(value);
  const timestamp = typeof source?.updatedAt === 'string'
    ? source.updatedAt
    : typeof source?.createdAt === 'string'
      ? source.createdAt
      : MIGRATION_EPOCH;
  return {
    id: typeof source?.id === 'string' && source.id.length > 0 ? source.id : `migrated-${fallbackName}`,
    name: typeof source?.name === 'string' && source.name.length > 0 ? source.name : fallbackName,
    ...(typeof source?.description === 'string' ? { description: source.description } : {}),
    createdAt: typeof source?.createdAt === 'string' ? source.createdAt : timestamp,
    updatedAt: timestamp,
    ...(typeof source?.orchestratorId === 'string' ? { orchestratorId: source.orchestratorId } : {}),
  };
}

function migrateLegacyProcess(source: Record<string, unknown>): ProcessFile {
  const nestedDiagram = asRecord(source.diagram);
  const metadata = normalizeMetadata(source.metadata, 'Migrated Process');
  const nodes = Array.isArray(source.nodes)
    ? source.nodes
    : Array.isArray(nestedDiagram?.nodes) ? nestedDiagram.nodes : [];
  const edges = Array.isArray(source.edges)
    ? source.edges
    : Array.isArray(nestedDiagram?.edges) ? nestedDiagram.edges : [];
  const variables = Array.isArray(source.variables) ? source.variables : [];

  return {
    version: CURRENT_FORMAT_VERSION,
    exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : MIGRATION_EPOCH,
    metadata,
    nodes: nodes as ProcessFile['nodes'],
    edges: edges as ProcessFile['edges'],
    ...(asRecord(source.viewport) ? { viewport: source.viewport as ProcessFile['viewport'] } : {}),
    variables: variables as ProcessVariable[],
  };
}

function normalizeProject(source: Record<string, unknown>, diagrams: Record<string, DiagramDocument>): ProjectConfig {
  const project = asRecord(source.project) || {};
  const projectDiagrams = Array.isArray(project.diagrams) ? project.diagrams : [];
  const normalizedDiagrams = projectDiagrams.map((value, index) => {
    const diagram = asRecord(value) || {};
    const key = Object.keys(diagrams)[index] || `diagram-${index + 1}`;
    const metadata = normalizeMetadata(diagram, typeof diagram.name === 'string' ? diagram.name : key);
    return {
      id: typeof diagram.id === 'string' ? diagram.id : metadata.id,
      name: typeof diagram.name === 'string' ? diagram.name : metadata.name,
      type: (diagram.type === 'library' || diagram.type === 'sub-diagram' ? diagram.type : 'main') as 'main' | 'sub-diagram' | 'library',
      path: typeof diagram.path === 'string' ? diagram.path : `${metadata.name}.process`,
      ...(Array.isArray(diagram.inputs) ? { inputs: diagram.inputs.filter((v): v is string => typeof v === 'string') } : {}),
      ...(Array.isArray(diagram.outputs) ? { outputs: diagram.outputs.filter((v): v is string => typeof v === 'string') } : {}),
      ...(typeof diagram.folder === 'string' ? { folder: diagram.folder } : {}),
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    };
  });
  const firstDiagram = normalizedDiagrams[0];
  return {
    ...(typeof project.id === 'string' ? { id: project.id } : {}),
    name: typeof project.name === 'string' && project.name.length > 0 ? project.name : 'Migrated Project',
    version: typeof project.version === 'string' ? project.version : '1.0.0',
    main: typeof project.main === 'string' ? project.main : firstDiagram?.id || '',
    diagrams: normalizedDiagrams,
    folders: Array.isArray(project.folders) ? project.folders.filter((v): v is string => typeof v === 'string') : [],
    settings: {
      defaultTimeout: typeof asRecord(project.settings)?.defaultTimeout === 'number'
        ? asRecord(project.settings)?.defaultTimeout as number
        : 30000,
      screenshotOnError: typeof asRecord(project.settings)?.screenshotOnError === 'boolean'
        ? asRecord(project.settings)?.screenshotOnError as boolean
        : true,
    },
  };
}

function migrateLegacyProject(source: Record<string, unknown>): ProjectFile {
  const rawDiagrams = asRecord(source.diagrams) || {};
  const diagrams: Record<string, DiagramDocument> = {};
  for (const [id, value] of Object.entries(rawDiagrams)) {
    const diagram = asRecord(value) || {};
    const metadata = normalizeMetadata(diagram.metadata, id);
    diagrams[id] = {
      metadata,
      nodes: (Array.isArray(diagram.nodes) ? diagram.nodes : []) as DiagramDocument['nodes'],
      edges: (Array.isArray(diagram.edges) ? diagram.edges : []) as DiagramDocument['edges'],
      ...(asRecord(diagram.viewport) ? { viewport: diagram.viewport as DiagramDocument['viewport'] } : {}),
    };
  }
  const rawProject = asRecord(source.project) || {};
  const project = Array.isArray(rawProject.diagrams)
    ? rawProject
    : {
      ...rawProject,
      diagrams: Object.entries(diagrams).map(([id, diagram]) => ({
        id,
        name: diagram.metadata.name,
        type: id === Object.keys(diagrams)[0] ? 'main' : 'sub-diagram',
        path: `${diagram.metadata.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.process`,
        createdAt: diagram.metadata.createdAt,
        updatedAt: diagram.metadata.updatedAt,
      })),
    };
  const migrated: ProjectFile = {
    version: CURRENT_FORMAT_VERSION,
    exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : MIGRATION_EPOCH,
    project: normalizeProject({ ...source, project }, diagrams),
    diagrams,
    ...(asRecord(source.variables)
      ? { variables: asRecord(source.variables) as Record<string, ProcessVariable[]> }
      : {}),
  };
  return migrated;
}

function rejectUnsupportedVersion(version: unknown, kind: string): string | null {
  if (version === CURRENT_FORMAT_VERSION || version === LEGACY_FORMAT_VERSION) return null;
  return typeof version === 'string'
    ? `Unsupported ${kind} file version: ${version}`
    : `Invalid ${kind} file version`;
}

export function serializeDiagram(
  nodes: RpaNode<ProcessNodeData>[],
  edges: RpaEdge[],
  metadata: ProcessMetadata,
  viewport?: { x: number; y: number; zoom: number },
  variables: ProcessVariable[] = []
): string {
  const exportData: ProcessFile = {
    version: PROCESS_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    metadata,
    nodes,
    edges,
    viewport,
    variables: sanitizeVariablesForPersistence(variables),
  };
  return JSON.stringify(exportData, null, 2);
}

export const serializeProcess = serializeDiagram;

export function deserializeDiagram(json: string): DiagramImportResult {
  try {
    const source = JSON.parse(json) as unknown;
    const record = asRecord(source);
    const versionError = rejectUnsupportedVersion(record?.version, 'process');
    if (versionError) return { success: false, error: versionError };

    const currentProcess = record?.version === CURRENT_FORMAT_VERSION;
    const validCurrentProcess = currentProcess && validateProcess(source);
    const historicalProcess = currentProcess && !validCurrentProcess && validateHistoricalProcess(source);
    if (validCurrentProcess) {
      return { success: true, diagram: source as ProcessFile };
    }

    if (!historicalProcess && !validateLegacyProcess(source)) {
      const errors = currentProcess ? validateProcess.errors : validateLegacyProcess.errors;
      return { success: false, error: `Invalid process file schema: ${schemaError(errors)}` };
    }
    if (historicalProcess && !validateHistoricalProcess(source)) {
      return { success: false, error: `Invalid legacy process schema: ${schemaError(validateLegacyProcess.errors)}` };
    }
    const nestedDiagram = asRecord(record?.diagram);
    if (!Array.isArray(record?.nodes) && !Array.isArray(nestedDiagram?.nodes)) {
      return { success: false, error: 'Legacy process file is missing nodes' };
    }
    const migrated = migrateLegacyProcess(record as Record<string, unknown>);
    if (!validateProcess(migrated)) {
      return { success: false, error: `Migrated process failed schema validation: ${schemaError(validateProcess.errors)}` };
    }
    return { success: true, diagram: migrated };
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
  diagrams: Record<string, DiagramDocument>,
  variables?: Record<string, ProcessVariable[]>
): string {
  const exportData: ProjectFile = {
    version: PROJECT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    diagrams,
    variables: variables ? sanitizeVariableMapForPersistence(variables) : undefined,
  };
  return JSON.stringify(exportData, null, 2);
}

export function deserializeProject(json: string): ProjectImportResult {
  try {
    const source = JSON.parse(json) as unknown;
    const record = asRecord(source);
    const versionError = rejectUnsupportedVersion(record?.version, 'project');
    if (versionError) return { success: false, error: versionError };

    if (record?.version === CURRENT_FORMAT_VERSION) {
      if (!validateProject(source)) {
        return { success: false, error: `Invalid project file schema: ${schemaError(validateProject.errors)}` };
      }
      const data = source as ProjectFile;
      data.variables ??= {};
      return { success: true, project: data };
    }

    if (!validateLegacyProject(source)) {
      return { success: false, error: `Invalid legacy project schema: ${schemaError(validateLegacyProject.errors)}` };
    }
    const migrated = migrateLegacyProject(record as Record<string, unknown>);
    if (!validateProject(migrated)) {
      return { success: false, error: `Migrated project failed schema validation: ${schemaError(validateProject.errors)}` };
    }
    migrated.variables ??= {};
    return { success: true, project: migrated };
  } catch (e) {
    return { success: false, error: `Failed to parse project file: ${e}` };
  }
}

export function serializeProjectManifest(
  project: ProjectConfig,
  variables?: Record<string, ProcessVariable[]>
): string {
  const manifest: ProjectManifestFile = {
    version: CURRENT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    diagrams: project.diagrams.map(({ path, type, name, folder }) => ({ path, type, name, folder })),
    folders: project.folders,
    variables: variables ? sanitizeVariableMapForPersistence(variables) : undefined,
  };
  return JSON.stringify(manifest, null, 2);
}

export function deserializeProjectManifest(json: string): ProjectManifestResult {
  try {
    const source = JSON.parse(json) as unknown;
    const record = asRecord(source);
    const versionError = rejectUnsupportedVersion(record?.version, 'project manifest');
    if (versionError) return { success: false, error: versionError };

    const currentManifest = record?.version === CURRENT_FORMAT_VERSION;
    const validCurrentManifest = currentManifest && validateProjectManifest(source);
    const historicalManifest = currentManifest && !validCurrentManifest && validateHistoricalProjectManifest(source);
    if (validCurrentManifest) {
      return { success: true, project: source as ProjectManifestFile };
    }

    if (!historicalManifest && !validateLegacyProjectManifest(source)) {
      const errors = currentManifest ? validateProjectManifest.errors : validateLegacyProjectManifest.errors;
      return { success: false, error: `Invalid project manifest schema: ${schemaError(errors)}` };
    }
    const rawProject = asRecord(record?.project) || {};
    const rawDiagrams = Array.isArray(record?.diagrams) ? record.diagrams : [];
    const project = normalizeProject({
      ...record,
      project: { ...rawProject, diagrams: rawDiagrams },
    }, {});
    const migrated: ProjectManifestFile = {
      version: CURRENT_FORMAT_VERSION,
      exportedAt: typeof record?.exportedAt === 'string' ? record.exportedAt : MIGRATION_EPOCH,
      project,
      diagrams: rawDiagrams as ProjectManifestFile['diagrams'],
      folders: Array.isArray(record?.folders) ? record.folders.filter((v): v is string => typeof v === 'string') : [],
      ...(asRecord(record?.variables)
        ? { variables: asRecord(record?.variables) as Record<string, ProcessVariable[]> }
        : {}),
    };
    if (!validateProjectManifest(migrated)) {
      return { success: false, error: `Migrated project manifest failed schema validation: ${schemaError(validateProjectManifest.errors)}` };
    }
    return { success: true, project: migrated };
  } catch (e) {
    return { success: false, error: `Failed to parse project manifest: ${e}` };
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
