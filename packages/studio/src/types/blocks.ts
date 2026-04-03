export type BlockType =
  | 'start'
  | 'end'
  | 'if'
  | 'switch'
  | 'while'
  | 'for-each'
  | 'parallel'
  | 'retry-scope'
  | 'try-catch'
  | 'throw'
  | 'assign'
  | 'get-variable'
  | 'set-variable'
  | 'activity'
  | 'sub-diagram-call';

export type BlockCategory =
  | 'flow-control'
  | 'error-handling'
  | 'variables'
  | 'web-automation'
  | 'desktop-automation'
  | 'data-operations'
  | 'ocr'
  | 'sub-diagram';

export type PortType =
  | 'input'
  | 'output'
  | 'true'
  | 'false'
  | 'branch'
  | 'merge'
  | 'error';

export interface Port {
  id: string;
  type: PortType;
  label?: string;
  position: 'left' | 'right' | 'top' | 'bottom';
  dataType?: string;
}

export interface BlockPortConfig {
  inputs: Port[];
  outputs: Port[];
}

export const BLOCK_PORT_CONFIGS: Record<BlockType, BlockPortConfig> = {
  start: {
    inputs: [],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  end: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [],
  },
  if: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [
      { id: 'true', type: 'true', label: 'True', position: 'right' },
      { id: 'false', type: 'false', label: 'False', position: 'right' },
    ],
  },
  switch: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'default', type: 'output', label: 'Default', position: 'right' }],
  },
  while: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'for-each': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  parallel: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'retry-scope': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'try-catch': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  throw: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [],
  },
  assign: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'get-variable': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'set-variable': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  activity: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'sub-diagram-call': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
};

export const BLOCK_COLORS: Record<BlockCategory, { primary: string; hover: string; border: string }> = {
  'flow-control': { primary: '#3B82F6', hover: '#2563EB', border: '#1D4ED8' },
  'error-handling': { primary: '#F59E0B', hover: '#D97706', border: '#B45309' },
  variables: { primary: '#6B7280', hover: '#4B5563', border: '#374151' },
  'web-automation': { primary: '#10B981', hover: '#059669', border: '#047857' },
  'desktop-automation': { primary: '#8B5CF6', hover: '#7C3AED', border: '#6D28D9' },
  'data-operations': { primary: '#14B8A6', hover: '#0D9488', border: '#0F766E' },
  ocr: { primary: '#EC4899', hover: '#DB2777', border: '#BE185D' },
  'sub-diagram': { primary: '#6366F1', hover: '#4F46E5', border: '#4338CA' },
};

export const BLOCK_ICONS: Record<BlockType, string> = {
  start: '▶',
  end: '■',
  if: '◆',
  switch: '⇄',
  while: '↻',
  'for-each': '↻',
  parallel: '⋮⋮',
  'retry-scope': '↺',
  'try-catch': '⚠',
  throw: '⚡',
  assign: '📝',
  'get-variable': '📥',
  'set-variable': '📤',
  activity: '⚙',
  'sub-diagram-call': '📞',
};

export const BLOCK_CATEGORIES: Record<BlockCategory, { name: string; icon: string }> = {
  'flow-control': { name: 'Flow Control', icon: '🔀' },
  'error-handling': { name: 'Error Handling', icon: '⚠️' },
  variables: { name: 'Variables', icon: '📦' },
  'web-automation': { name: 'Web Automation', icon: '🌐' },
  'desktop-automation': { name: 'Desktop Automation', icon: '🖥️' },
  'data-operations': { name: 'Data Operations', icon: '💾' },
  ocr: { name: 'OCR', icon: '👁️' },
  'sub-diagram': { name: 'Sub-Diagrams', icon: '📞' },
};

export const BLOCK_TYPE_TO_CATEGORY: Record<BlockType, BlockCategory> = {
  start: 'flow-control',
  end: 'flow-control',
  if: 'flow-control',
  switch: 'flow-control',
  while: 'flow-control',
  'for-each': 'flow-control',
  parallel: 'flow-control',
  'retry-scope': 'flow-control',
  'try-catch': 'error-handling',
  throw: 'error-handling',
  assign: 'variables',
  'get-variable': 'variables',
  'set-variable': 'variables',
  activity: 'web-automation',
  'sub-diagram-call': 'sub-diagram',
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  start: 'Start',
  end: 'End',
  if: 'If',
  switch: 'Switch',
  while: 'While',
  'for-each': 'For Each',
  parallel: 'Parallel',
  'retry-scope': 'Retry Scope',
  'try-catch': 'Try Catch',
  throw: 'Throw',
  assign: 'Assign',
  'get-variable': 'Get Variable',
  'set-variable': 'Set Variable',
  activity: 'Activity',
  'sub-diagram-call': 'Call Sub-Diagram',
};

export interface BaseBlockData {
  id: string;
  type: BlockType;
  name: string;
  label: string;
  category: BlockCategory;
  description?: string;
}

export interface StartBlockData extends BaseBlockData {
  type: 'start';
  processName: string;
  tags?: string[];
}

export interface EndBlockData extends BaseBlockData {
  type: 'end';
  status: 'PASS' | 'FAIL';
  message?: string;
}

export interface IfBlockData extends BaseBlockData {
  type: 'if';
  condition: string;
  thenBranch?: string[];
  elseBranch?: string[];
}

export interface WhileBlockData extends BaseBlockData {
  type: 'while';
  condition: string;
  maxIterations?: number;
  body?: string[];
}

export interface ForEachBlockData extends BaseBlockData {
  type: 'for-each';
  itemVariable: string;
  collection: string;
  body?: string[];
}

export interface ParallelBlockData extends BaseBlockData {
  type: 'parallel';
  branches: Array<{ id: string; name: string; activities: string[] }>;
}

export interface RetryScopeBlockData extends BaseBlockData {
  type: 'retry-scope';
  retryCount: number;
  retryInterval: string;
  condition?: string;
  body?: string[];
}

export interface TryCatchBlockData extends BaseBlockData {
  type: 'try-catch';
  tryBlock?: string[];
  exceptBlocks: Array<{
    id: string;
    exceptionType: string;
    variable?: string;
    handler?: string[];
  }>;
  finallyBlock?: string[];
}

export interface ThrowBlockData extends BaseBlockData {
  type: 'throw';
  message: string;
  exceptionType?: string;
}

export interface AssignBlockData extends BaseBlockData {
  type: 'assign';
  variableName: string;
  variableType: string;
  expression: string;
  scope: 'local' | 'suite' | 'global';
}

export interface GetVariableBlockData extends BaseBlockData {
  type: 'get-variable';
  variableName: string;
  outputVariable: string;
}

export interface SetVariableBlockData extends BaseBlockData {
  type: 'set-variable';
  variableName: string;
  value: string;
  scope: 'local' | 'suite' | 'global';
}

export interface ActivityBlockData extends BaseBlockData {
  type: 'activity';
  activityId: string;
  library: string;
  arguments: Record<string, unknown>;
}

export interface SubDiagramCallBlockData extends BaseBlockData {
  type: 'sub-diagram-call';
  diagramId: string;
  diagramName: string;
  parameters: Record<string, string>;
  returns: Record<string, string>;
}

export type BlockData =
  | StartBlockData
  | EndBlockData
  | IfBlockData
  | WhileBlockData
  | ForEachBlockData
  | ParallelBlockData
  | RetryScopeBlockData
  | TryCatchBlockData
  | ThrowBlockData
  | AssignBlockData
  | GetVariableBlockData
  | SetVariableBlockData
  | ActivityBlockData
  | SubDiagramCallBlockData;

export function createDefaultBlockData(type: BlockType, id: string): BlockData {
  const category = BLOCK_TYPE_TO_CATEGORY[type];
  const label = BLOCK_LABELS[type];

  const base = {
    id,
    type,
    name: label,
    label,
    category,
    description: undefined,
  };

  switch (type) {
    case 'start':
      return { ...base, type: 'start', processName: 'Main Process' };
    case 'end':
      return { ...base, type: 'end', status: 'PASS' };
    case 'if':
      return { ...base, type: 'if', condition: '${True}' };
    case 'while':
      return { ...base, type: 'while', condition: '${True}', maxIterations: 100 };
    case 'for-each':
      return { ...base, type: 'for-each', itemVariable: '${item}', collection: '@{list}' };
    case 'parallel':
      return { ...base, type: 'parallel', branches: [] };
    case 'retry-scope':
      return { ...base, type: 'retry-scope', retryCount: 3, retryInterval: '2s' };
    case 'try-catch':
      return { ...base, type: 'try-catch', exceptBlocks: [] };
    case 'throw':
      return { ...base, type: 'throw', message: 'Error occurred' };
    case 'assign':
      return { ...base, type: 'assign', variableName: '', variableType: 'string', expression: '', scope: 'local' };
    case 'get-variable':
      return { ...base, type: 'get-variable', variableName: '', outputVariable: '' };
    case 'set-variable':
      return { ...base, type: 'set-variable', variableName: '', value: '', scope: 'local' };
    case 'activity':
      return { ...base, type: 'activity', activityId: '', library: '', arguments: {} };
    case 'sub-diagram-call':
      return { ...base, type: 'sub-diagram-call', diagramId: '', diagramName: '', parameters: {}, returns: {} };
    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}
