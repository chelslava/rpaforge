import type {
  Activity,
  ActivityBuiltinSettings,
  ActivityParamType,
  ActivityPorts,
  ActivityRobotFrameworkMetadata,
  ActivityType,
} from './engine';
import { getActivityDefaultValues, getActivityDisplayLibrary } from './engine';

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
  | 'credentials'
  | 'built-in'
  | 'sub-diagram';

export type PortType =
  | 'input'
  | 'output'
  | 'true'
  | 'false'
  | 'branch'
  | 'merge'
  | 'error'
  | 'data';

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

export interface BlockColor {
  primary: string;
  hover: string;
  border: string;
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
    outputs: [
      { id: 'body', type: 'output', label: 'Body', position: 'right' },
      { id: 'next', type: 'output', label: 'Next', position: 'right' },
    ],
  },
  'for-each': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [
      { id: 'body', type: 'output', label: 'Body', position: 'right' },
      { id: 'next', type: 'output', label: 'Next', position: 'right' },
    ],
  },
  parallel: {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [
      { id: 'branch-1', type: 'branch', label: 'Branch 1', position: 'right' },
      { id: 'branch-2', type: 'branch', label: 'Branch 2', position: 'right' },
    ],
  },
  'retry-scope': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [{ id: 'output', type: 'output', position: 'right' }],
  },
  'try-catch': {
    inputs: [{ id: 'input', type: 'input', position: 'left' }],
    outputs: [
      { id: 'output', type: 'output', label: 'Success', position: 'right' },
      { id: 'error', type: 'error', label: 'Error', position: 'right' },
    ],
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

export const BLOCK_COLORS: Record<BlockCategory, BlockColor> = {
  'flow-control': { primary: '#3B82F6', hover: '#2563EB', border: '#1D4ED8' },
  'error-handling': { primary: '#F59E0B', hover: '#D97706', border: '#B45309' },
  variables: { primary: '#6B7280', hover: '#4B5563', border: '#374151' },
  'web-automation': { primary: '#10B981', hover: '#059669', border: '#047857' },
  'desktop-automation': { primary: '#8B5CF6', hover: '#7C3AED', border: '#6D28D9' },
  'data-operations': { primary: '#14B8A6', hover: '#0D9488', border: '#0F766E' },
  ocr: { primary: '#EC4899', hover: '#DB2777', border: '#BE185D' },
  credentials: { primary: '#F97316', hover: '#EA580C', border: '#C2410C' },
  'built-in': { primary: '#64748B', hover: '#475569', border: '#334155' },
  'sub-diagram': { primary: '#6366F1', hover: '#4F46E5', border: '#4338CA' },
};

export const BLOCK_ICONS: Record<BlockType, string> = {
  start: '▶',
  end: '■',
  if: '◆',
  switch: '⇄',
  while: '↻',
  'for-each': '⟳',
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
  credentials: { name: 'Credentials', icon: '🔐' },
  'built-in': { name: 'Built In', icon: '🧰' },
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
  while: 'While Loop',
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

const SDK_CATEGORY_TO_BLOCK_CATEGORY: Record<string, BlockCategory> = {
  builtin: 'built-in',
  credentials: 'credentials',
  data: 'data-operations',
  database: 'data-operations',
  desktop: 'desktop-automation',
  excel: 'data-operations',
  'error handling': 'error-handling',
  'flow control': 'flow-control',
  ocr: 'ocr',
  subdiagram: 'sub-diagram',
  'sub-diagram': 'sub-diagram',
  web: 'web-automation',
};

export interface BaseBlockData {
  id: string;
  type: BlockType;
  name: string;
  label: string;
  category: string;
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
  timeout?: number;
}

export interface SwitchBlockData extends BaseBlockData {
  type: 'switch';
  expression: string;
  cases: Array<{ id: string; value: string; label: string }>;
}

export interface ForEachBlockData extends BaseBlockData {
  type: 'for-each';
  itemVariable: string;
  collection: string;
  parallel?: boolean;
  timeout?: number;
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
  activityType: ActivityType;
  icon?: string;
  library: string;
  params: Record<string, unknown>;
  paramTypes: Record<string, ActivityParamType>;
  ports: ActivityPorts;
  builtin: ActivityBuiltinSettings;
  robotFramework: ActivityRobotFrameworkMetadata;
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
  | SwitchBlockData
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

export function isStartBlock(block: BlockData): block is StartBlockData {
  return block.type === 'start';
}

export function isEndBlock(block: BlockData): block is EndBlockData {
  return block.type === 'end';
}

export function isIfBlock(block: BlockData): block is IfBlockData {
  return block.type === 'if';
}

export function isWhileBlock(block: BlockData): block is WhileBlockData {
  return block.type === 'while';
}

export function isSwitchBlock(block: BlockData): block is SwitchBlockData {
  return block.type === 'switch';
}

export function isForEachBlock(block: BlockData): block is ForEachBlockData {
  return block.type === 'for-each';
}

export function isParallelBlock(block: BlockData): block is ParallelBlockData {
  return block.type === 'parallel';
}

export function isRetryScopeBlock(block: BlockData): block is RetryScopeBlockData {
  return block.type === 'retry-scope';
}

export function isTryCatchBlock(block: BlockData): block is TryCatchBlockData {
  return block.type === 'try-catch';
}

export function isThrowBlock(block: BlockData): block is ThrowBlockData {
  return block.type === 'throw';
}

export function isAssignBlock(block: BlockData): block is AssignBlockData {
  return block.type === 'assign';
}

export function isGetVariableBlock(block: BlockData): block is GetVariableBlockData {
  return block.type === 'get-variable';
}

export function isSetVariableBlock(block: BlockData): block is SetVariableBlockData {
  return block.type === 'set-variable';
}

export function isActivityBlock(block: BlockData): block is ActivityBlockData {
  return block.type === 'activity';
}

export function isSubDiagramCallBlock(block: BlockData): block is SubDiagramCallBlockData {
  return block.type === 'sub-diagram-call';
}

export function getBlockCategoryKey(category: string | undefined): BlockCategory {
  if (!category) {
    return 'built-in';
  }

  const normalized = category.trim().toLowerCase();
  return SDK_CATEGORY_TO_BLOCK_CATEGORY[normalized] || 'built-in';
}

export function getBlockColors(category: string | undefined, type?: BlockType): BlockColor {
  if (type === 'start') {
    return { primary: '#22C55E', hover: '#16A34A', border: '#16A34A' };
  }

  if (type === 'end') {
    return { primary: '#EF4444', hover: '#DC2626', border: '#DC2626' };
  }

  return BLOCK_COLORS[getBlockCategoryKey(category)];
}

function mapActivityPortToBlockPort(
  port: ActivityPorts['inputs'][number] | ActivityPorts['outputs'][number],
  direction: 'input' | 'output'
): Port {
  const normalizedId = port.id.toLowerCase();

  let type: PortType = direction === 'input' ? 'input' : 'output';
  if (normalizedId === 'true') {
    type = 'true';
  } else if (normalizedId === 'false') {
    type = 'false';
  } else if (port.type === 'error' || normalizedId === 'error') {
    type = 'error';
  } else if (port.type === 'data') {
    type = 'data';
  } else if (normalizedId.startsWith('branch')) {
    type = 'branch';
  }

  return {
    id: port.id,
    type,
    label: port.label,
    position: direction === 'input' ? 'left' : 'right',
  };
}

export function getActivityPortConfig(activity: Activity): BlockPortConfig {
  const inputs = activity.ports.inputs.map((port) => mapActivityPortToBlockPort(port, 'input'));
  const outputs = activity.ports.outputs.map((port) =>
    mapActivityPortToBlockPort(port, 'output')
  );

  return {
    inputs: inputs.length > 0 ? inputs : BLOCK_PORT_CONFIGS.activity.inputs,
    outputs: outputs.length > 0 ? outputs : BLOCK_PORT_CONFIGS.activity.outputs,
  };
}

export function getSwitchPortConfig(blockData: SwitchBlockData): BlockPortConfig {
  const dynamicOutputs = blockData.cases.map((switchCase) => ({
    id: switchCase.id || `case-${switchCase.value || switchCase.label || 'default'}`,
    type: 'output' as const,
    label: switchCase.label || switchCase.value || 'Case',
    position: 'right' as const,
  }));

  return {
    inputs: BLOCK_PORT_CONFIGS.switch.inputs,
    outputs:
      dynamicOutputs.length > 0
        ? [
            ...dynamicOutputs,
            {
              id: 'default',
              type: 'output',
              label: 'Default',
              position: 'right',
            },
          ]
        : BLOCK_PORT_CONFIGS.switch.outputs,
  };
}

export function getParallelPortConfig(blockData: ParallelBlockData): BlockPortConfig {
  const branches = blockData.branches.length > 0
    ? blockData.branches
    : [
        { id: 'branch-1', name: 'Branch 1', activities: [] },
        { id: 'branch-2', name: 'Branch 2', activities: [] },
      ];

  return {
    inputs: BLOCK_PORT_CONFIGS.parallel.inputs,
    outputs: branches.map((branch, index) => ({
      id: branch.id || `branch-${index + 1}`,
      type: 'branch' as const,
      label: branch.name || `Branch ${index + 1}`,
      position: 'right' as const,
    })),
  };
}

export function getTryCatchPortConfig(blockData: TryCatchBlockData): BlockPortConfig {
  const outputs: Port[] = [
    {
      id: 'output',
      type: 'output',
      label: 'Success',
      position: 'right',
    },
  ];

  if (blockData.exceptBlocks.length > 0) {
    blockData.exceptBlocks.forEach((exceptBlock) => {
      outputs.push({
        id: exceptBlock.id,
        type: 'error',
        label: exceptBlock.exceptionType || 'Exception',
        position: 'right',
      });
    });
  } else {
    outputs.push({
      id: 'error',
      type: 'error',
      label: 'Except',
      position: 'right',
    });
  }

  if (blockData.finallyBlock) {
    outputs.push({
      id: 'finally',
      type: 'output',
      label: 'Finally',
      position: 'right',
    });
  }

  return {
    inputs: BLOCK_PORT_CONFIGS['try-catch'].inputs,
    outputs,
  };
}

export function createActivityBlockData(activity: Activity, id: string): ActivityBlockData {
  return {
    id,
    type: 'activity',
    name: activity.name,
    label: activity.name,
    category: activity.category,
    description: activity.description,
    activityId: activity.id,
    activityType: activity.type,
    icon: activity.icon,
    library: getActivityDisplayLibrary(activity),
    params: getActivityDefaultValues(activity),
    paramTypes: Object.fromEntries(activity.params.map((param) => [param.name, param.type])),
    ports: activity.ports,
    builtin: activity.builtin,
    robotFramework: activity.robotFramework,
  };
}

export function createDefaultBlockData(type: BlockType, id: string): BlockData {
  const category = BLOCK_TYPE_TO_CATEGORY[type];
  const label = BLOCK_LABELS[type];

  const base: BaseBlockData = {
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
      return {
        ...base,
        type: 'for-each',
        itemVariable: '${item}',
        collection: '@{list}',
      };
    case 'parallel':
      return {
        ...base,
        type: 'parallel',
        branches: [
          { id: 'branch-1', name: 'Branch 1', activities: [] },
          { id: 'branch-2', name: 'Branch 2', activities: [] },
        ],
      };
    case 'retry-scope':
      return { ...base, type: 'retry-scope', retryCount: 3, retryInterval: '2s' };
    case 'try-catch':
      return { ...base, type: 'try-catch', exceptBlocks: [] };
    case 'throw':
      return { ...base, type: 'throw', message: 'Error occurred' };
    case 'switch':
      return { ...base, type: 'switch', expression: '', cases: [] };
    case 'assign':
      return {
        ...base,
        type: 'assign',
        variableName: '',
        variableType: 'string',
        expression: '',
        scope: 'local',
      };
    case 'get-variable':
      return { ...base, type: 'get-variable', variableName: '', outputVariable: '' };
    case 'set-variable':
      return { ...base, type: 'set-variable', variableName: '', value: '', scope: 'local' };
    case 'activity':
      return {
        ...base,
        type: 'activity',
        activityId: '',
        activityType: 'sync',
        icon: '⚙',
        library: 'BuiltIn',
        params: {},
        paramTypes: {},
        ports: { inputs: [], outputs: [] },
        builtin: {
          timeout: true,
          retry: false,
          continueOnError: false,
          nested: false,
        },
        robotFramework: {
          keyword: '',
          library: 'BuiltIn',
        },
      };
    case 'sub-diagram-call':
      return {
        ...base,
        type: 'sub-diagram-call',
        diagramId: '',
        diagramName: '',
        parameters: {},
        returns: {},
      };
    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}
