import type { RpaNode, RpaEdge } from '../types/domain-model';
import type { ProcessNodeData, ProcessMetadata } from '../stores/processStore';
import type { DiagramDocument, DiagramType, ProjectConfig } from '../stores/diagramStore';
import type { ProcessVariable } from '../stores/variableStore';
import { createLogger } from './logger';
import {
  sanitizeVariableMapForPersistence,
  sanitizeVariablesForPersistence,
} from './secretSerialization';

export const PROCESS_EXTENSION = '.process';
export const PROJECT_EXTENSION = '.rpaforge';

export const LEGACY_FILE_FORMAT_VERSION = '1.0.0';
export const CURRENT_FILE_FORMAT_VERSION = '1.1.0';
const SUPPORTED_FILE_FORMAT_VERSIONS = [LEGACY_FILE_FORMAT_VERSION, CURRENT_FILE_FORMAT_VERSION] as const;
const logger = createLogger('fileUtils');

type VersionedFile = Record<string, unknown>;

const metadataSchema = {
  type: 'object',
  required: ['id', 'name', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    orchestratorId: { type: 'string' },
  },
  additionalProperties: true,
};

const nodeSchema = {
  type: 'object',
  required: ['id', 'position', 'data'],
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    position: {
      type: 'object',
      required: ['x', 'y'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
      },
      additionalProperties: true,
    },
    data: { type: 'object' },
  },
  additionalProperties: true,
};

const edgeSchema = {
  type: 'object',
  required: ['id', 'source', 'target'],
  properties: {
    id: { type: 'string' },
    source: { type: 'string' },
    target: { type: 'string' },
  },
  additionalProperties: true,
};

const variablesSchema = {
  type: 'array',
  items: { type: 'object' },
};

const settingsSchema = {
  type: 'object',
  required: ['defaultTimeout', 'screenshotOnError'],
  properties: {
    defaultTimeout: { type: 'number' },
    screenshotOnError: { type: 'boolean' },
  },
  additionalProperties: true,
};

const projectConfigSchema = {
  type: 'object',
  required: ['name', 'version', 'main', 'diagrams', 'folders', 'settings'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    version: { type: 'string' },
    main: { type: 'string' },
    diagrams: { type: 'array' },
    folders: { type: 'array', items: { type: 'string' } },
    settings: settingsSchema,
  },
  additionalProperties: true,
};

const diagramDocumentSchema = {
  type: 'object',
  required: ['metadata', 'nodes', 'edges'],
  properties: {
    metadata: metadataSchema,
    nodes: { type: 'array', items: nodeSchema },
    edges: { type: 'array', items: edgeSchema },
    viewport: {
      type: 'object',
      required: ['x', 'y', 'zoom'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        zoom: { type: 'number' },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: true,
};

const processSchema = (version: string, legacy: boolean) => ({
  type: 'object',
  required: ['version', 'metadata'],
  properties: {
    version: { const: version },
    exportedAt: { type: 'string' },
    metadata: metadataSchema,
    nodes: { type: 'array', items: nodeSchema },
    edges: { type: 'array', items: edgeSchema },
    diagram: {
      type: 'object',
      required: ['nodes', 'edges'],
      properties: {
        nodes: { type: 'array', items: nodeSchema },
        edges: { type: 'array', items: edgeSchema },
      },
      additionalProperties: true,
    },
    variables: variablesSchema,
  },
  allOf: [{
    anyOf: legacy
      ? [{ required: ['nodes', 'edges'] }, { required: ['diagram'] }]
      : [{ required: ['nodes', 'edges'] }],
  }],
  additionalProperties: true,
});

const projectSchema = (version: string) => ({
  type: 'object',
  required: ['version', 'project', 'diagrams'],
  properties: {
    version: { const: version },
    exportedAt: { type: 'string' },
    project: projectConfigSchema,
    diagrams: {
      type: 'object',
      additionalProperties: diagramDocumentSchema,
    },
    variables: {
      type: 'object',
      additionalProperties: variablesSchema,
    },
  },
  additionalProperties: true,
});

const manifestSchema = (version: string) => ({
  type: 'object',
  required: ['version', 'project', 'diagrams'],
  properties: {
    version: { const: version },
    exportedAt: { type: 'string' },
    project: {
      type: 'object',
      required: version === CURRENT_FILE_FORMAT_VERSION
        ? ['name', 'version', 'main', 'settings']
        : ['name', 'version', 'settings'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'string' },
        main: { type: 'string' },
        settings: settingsSchema,
      },
      additionalProperties: true,
    },
    diagrams: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'type', 'name'],
        properties: {
          path: { type: 'string' },
          type: { enum: ['main', 'sub-diagram', 'library'] },
          name: { type: 'string' },
          folder: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
    folders: { type: 'array', items: { type: 'string' } },
    variables: {
      type: 'object',
      additionalProperties: variablesSchema,
    },
  },
  additionalProperties: true,
});

type JsonSchema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
};

type SchemaValidator = (value: unknown) => boolean;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  if ('const' in schema && !Object.is(value, schema.const)) {
    return false;
  }

  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    return false;
  }

  if (schema.type === 'object' && !isRecord(value)) {
    return false;
  }
  if (schema.type === 'array' && !Array.isArray(value)) {
    return false;
  }
  if (schema.type === 'string' && typeof value !== 'string') {
    return false;
  }
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    return false;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    return false;
  }

  if (schema.required && (!isRecord(value) || schema.required.some((key) => !(key in value)))) {
    return false;
  }

  if (schema.properties && isRecord(value)) {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      if (key in value && !matchesSchema(propertySchema, value[key])) {
        return false;
      }
    }
  }

  if (schema.items && Array.isArray(value) && value.some((item) => !matchesSchema(schema.items!, item))) {
    return false;
  }

  if (schema.allOf && !schema.allOf.every((subSchema) => matchesSchema(subSchema, value))) {
    return false;
  }

  if (schema.anyOf && !schema.anyOf.some((subSchema) => matchesSchema(subSchema, value))) {
    return false;
  }

  return true;
}

function createSchemaValidator(schema: JsonSchema): SchemaValidator {
  return (value) => matchesSchema(schema, value);
}

const processValidators = new Map<string, SchemaValidator>([
  [LEGACY_FILE_FORMAT_VERSION, createSchemaValidator(processSchema(LEGACY_FILE_FORMAT_VERSION, true))],
  [CURRENT_FILE_FORMAT_VERSION, createSchemaValidator(processSchema(CURRENT_FILE_FORMAT_VERSION, false))],
]);
const projectValidators = new Map<string, SchemaValidator>([
  [LEGACY_FILE_FORMAT_VERSION, createSchemaValidator(projectSchema(LEGACY_FILE_FORMAT_VERSION))],
  [CURRENT_FILE_FORMAT_VERSION, createSchemaValidator(projectSchema(CURRENT_FILE_FORMAT_VERSION))],
]);
const manifestValidators = new Map<string, SchemaValidator>([
  [LEGACY_FILE_FORMAT_VERSION, createSchemaValidator(manifestSchema(LEGACY_FILE_FORMAT_VERSION))],
  [CURRENT_FILE_FORMAT_VERSION, createSchemaValidator(manifestSchema(CURRENT_FILE_FORMAT_VERSION))],
]);

function asVersionedFile(value: unknown): VersionedFile | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as VersionedFile
    : null;
}

function getVersion(value: VersionedFile): string | null {
  return typeof value.version === 'string' ? value.version : null;
}

function validateVersionedFile(
  value: VersionedFile,
  kind: string,
  validators: Map<string, SchemaValidator>
): { version: string; error?: string } {
  const version = getVersion(value);
  if (!version) {
    return { version: '', error: `Invalid ${kind} file format` };
  }

  if (!SUPPORTED_FILE_FORMAT_VERSIONS.includes(version as typeof SUPPORTED_FILE_FORMAT_VERSIONS[number])) {
    return { version, error: `Unsupported ${kind} file version: ${version}` };
  }

  const validator = validators.get(version);
  if (!validator || !validator(value)) {
    return { version, error: `Invalid ${kind} file format` };
  }

  return { version };
}

function parseJson(json: string, kind: string): { value?: VersionedFile; error?: string } {
  try {
    const value = asVersionedFile(JSON.parse(json));
    return value ? { value } : { error: `Invalid ${kind} file format` };
  } catch {
    return { error: `Failed to parse ${kind} file` };
  }
}

function migrateProcess(value: VersionedFile): ProcessFile {
  const nestedDiagram = asVersionedFile(value.diagram);
  const nodes = Array.isArray(value.nodes) ? value.nodes : nestedDiagram?.nodes;
  const edges = Array.isArray(value.edges) ? value.edges : nestedDiagram?.edges;
  const withoutLegacyShape = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'diagram')
  );

  return {
    ...withoutLegacyShape,
    version: CURRENT_FILE_FORMAT_VERSION,
    nodes: nodes as ProcessFile['nodes'],
    edges: edges as ProcessFile['edges'],
    variables: Array.isArray(value.variables) ? value.variables as ProcessVariable[] : [],
  } as ProcessFile;
}

function migrateProject(value: VersionedFile): ProjectFile {
  return {
    ...value,
    version: CURRENT_FILE_FORMAT_VERSION,
    variables: value.variables && typeof value.variables === 'object'
      ? value.variables as Record<string, ProcessVariable[]>
      : {},
  } as ProjectFile;
}

function migrateManifest(value: VersionedFile): ProjectManifestFile {
  const project = asVersionedFile(value.project) || {};

  return {
    ...value,
    version: CURRENT_FILE_FORMAT_VERSION,
    project: {
      ...project,
      main: typeof project.main === 'string' ? project.main : '',
    } as ProjectManifestFile['project'],
    folders: Array.isArray(value.folders) ? value.folders as string[] : [],
    variables: value.variables && typeof value.variables === 'object'
      ? value.variables as Record<string, ProcessVariable[]>
      : {},
  } as ProjectManifestFile;
}

type FileMigration<T> = (value: VersionedFile) => T;

const processMigrations = new Map<string, FileMigration<ProcessFile>>([
  [LEGACY_FILE_FORMAT_VERSION, migrateProcess],
  [CURRENT_FILE_FORMAT_VERSION, migrateProcess],
]);
const projectMigrations = new Map<string, FileMigration<ProjectFile>>([
  [LEGACY_FILE_FORMAT_VERSION, migrateProject],
  [CURRENT_FILE_FORMAT_VERSION, migrateProject],
]);
const manifestMigrations = new Map<string, FileMigration<ProjectManifestFile>>([
  [LEGACY_FILE_FORMAT_VERSION, migrateManifest],
  [CURRENT_FILE_FORMAT_VERSION, migrateManifest],
]);

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

export interface ProjectManifestFile {
  version: string;
  exportedAt: string;
  project: Pick<ProjectConfig, 'id' | 'name' | 'version' | 'main' | 'settings'>;
  diagrams: Array<{
    path: string;
    type: DiagramType;
    name: string;
    folder?: string;
  }>;
  folders: string[];
  variables?: Record<string, ProcessVariable[]>;
}

export type ProjectExport = ProjectFile;

export interface ProjectImportResult {
  success: boolean;
  project?: ProjectFile;
  error?: string;
}

export interface ProjectManifestImportResult {
  success: boolean;
  manifest?: ProjectManifestFile;
  error?: string;
}

export function serializeDiagram(
  nodes: RpaNode<ProcessNodeData>[],
  edges: RpaEdge[],
  metadata: ProcessMetadata,
  viewport?: { x: number; y: number; zoom: number },
  variables: ProcessVariable[] = []
): string {
  const exportData: ProcessFile = {
    version: CURRENT_FILE_FORMAT_VERSION,
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
  const parsed = parseJson(json, 'process');
  if (!parsed.value) return { success: false, error: parsed.error };

  const validation = validateVersionedFile(parsed.value, 'process', processValidators);
  if (validation.error) return { success: false, error: validation.error };

  const migrate = processMigrations.get(validation.version);
  if (!migrate) return { success: false, error: 'Unsupported process file version' };
  const diagram = migrate(parsed.value);
  if (validation.version !== CURRENT_FILE_FORMAT_VERSION) {
    logger.info(`Migrated process file from ${validation.version} to ${CURRENT_FILE_FORMAT_VERSION}`);
  }

  return { success: true, diagram };
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
    version: CURRENT_FILE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
    diagrams,
    variables: variables ? sanitizeVariableMapForPersistence(variables) : undefined,
  };
  return JSON.stringify(exportData, null, 2);
}

export function deserializeProject(json: string): ProjectImportResult {
  const parsed = parseJson(json, 'project');
  if (!parsed.value) return { success: false, error: parsed.error };

  const validation = validateVersionedFile(parsed.value, 'project', projectValidators);
  if (validation.error) return { success: false, error: validation.error };

  const migrate = projectMigrations.get(validation.version);
  if (!migrate) return { success: false, error: 'Unsupported project file version' };
  const project = migrate(parsed.value);
  if (validation.version !== CURRENT_FILE_FORMAT_VERSION) {
    logger.info(`Migrated project file from ${validation.version} to ${CURRENT_FILE_FORMAT_VERSION}`);
  }

  return { success: true, project };
}

export function serializeProjectManifest(
  project: ProjectConfig,
  variables: Record<string, ProcessVariable[]> = {}
): string {
  const manifest: ProjectManifestFile = {
    version: CURRENT_FILE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      version: project.version,
      main: project.main,
      settings: project.settings,
    },
    diagrams: project.diagrams.map(({ path, type, name, folder }) => ({ path, type, name, folder })),
    folders: project.folders,
    variables,
  };

  return JSON.stringify(manifest, null, 2);
}

export function deserializeProjectManifest(json: string): ProjectManifestImportResult {
  const parsed = parseJson(json, 'project manifest');
  if (!parsed.value) return { success: false, error: parsed.error };

  const validation = validateVersionedFile(parsed.value, 'project manifest', manifestValidators);
  if (validation.error) return { success: false, error: validation.error };

  const migrate = manifestMigrations.get(validation.version);
  if (!migrate) return { success: false, error: 'Unsupported project manifest version' };
  const manifest = migrate(parsed.value);
  if (validation.version !== CURRENT_FILE_FORMAT_VERSION) {
    logger.info(`Migrated project manifest from ${validation.version} to ${CURRENT_FILE_FORMAT_VERSION}`);
  }

  return { success: true, manifest };
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
