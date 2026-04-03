import type { Edge } from '@reactflow/core';

export type ConnectionType =
  | 'normal'
  | 'true'
  | 'false'
  | 'error'
  | 'parallel';

export interface ConnectionData {
  type: ConnectionType;
  label?: string;
  animated?: boolean;
}

export interface ConnectionValidation {
  isValid: boolean;
  message?: string;
}

export const CONNECTION_STYLES: Record<ConnectionType, {
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
}> = {
  normal: {
    color: '#6B7280',
    strokeWidth: 2,
  },
  true: {
    color: '#22C55E',
    strokeWidth: 2,
  },
  false: {
    color: '#EF4444',
    strokeWidth: 2,
    strokeDasharray: '5,5',
  },
  error: {
    color: '#F59E0B',
    strokeWidth: 2,
    strokeDasharray: '2,2',
  },
  parallel: {
    color: '#14B8A6',
    strokeWidth: 3,
  },
};

export function getConnectionType(
  sourceHandle: string | null,
  _targetHandle: string | null
): ConnectionType {
  if (sourceHandle === 'true') return 'true';
  if (sourceHandle === 'false') return 'false';
  if (sourceHandle === 'error') return 'error';
  return 'normal';
}

export function validateConnection(
  sourceType: string,
  sourceHandle: string | null,
  targetType: string,
  targetHandle: string | null
): ConnectionValidation {
  if (sourceType === 'start' && sourceHandle !== 'output') {
    return { isValid: false, message: 'Start block only has output' };
  }

  if (targetType === 'end' && targetHandle !== 'input') {
    return { isValid: false, message: 'End block only has input' };
  }

  if (sourceHandle === 'output' && targetHandle && targetHandle !== 'input') {
    return { isValid: false, message: 'Output must connect to input' };
  }

  return { isValid: true };
}

export function createConnection(
  sourceId: string,
  targetId: string,
  sourceHandle: string | null,
  targetHandle: string | null
): Edge<ConnectionData> {
  const connectionType = getConnectionType(sourceHandle, targetHandle);
  const style = CONNECTION_STYLES[connectionType];

  return {
    id: `edge_${sourceId}_${sourceHandle || 'output'}_${targetId}_${targetHandle || 'input'}`,
    source: sourceId,
    target: targetId,
    sourceHandle: sourceHandle || 'output',
    targetHandle: targetHandle || 'input',
    type: 'custom',
    data: {
      type: connectionType,
      animated: style.animated,
    },
    style: {
      stroke: style.color,
      strokeWidth: style.strokeWidth,
      strokeDasharray: style.strokeDasharray,
    },
  };
}
