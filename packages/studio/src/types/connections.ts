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
  if (sourceHandle?.startsWith('branch')) return 'parallel';
  return 'normal';
}

export function validateConnection(
  sourceType: string,
  sourceHandle: string | null,
  targetType: string,
  targetHandle: string | null
): ConnectionValidation {
  if (!sourceHandle || !targetHandle) {
    return { isValid: false, message: 'Connections require explicit source and target ports.' };
  }

  if (sourceType === 'end') {
    return { isValid: false, message: 'End block cannot have outgoing connections.' };
  }

  if (targetType === 'start') {
    return { isValid: false, message: 'Start block cannot have incoming connections.' };
  }

  if (sourceType === 'start' && sourceHandle !== 'output') {
    return { isValid: false, message: 'Start block only has output' };
  }

  if (targetType === 'end' && targetHandle !== 'input') {
    return { isValid: false, message: 'End block only has input' };
  }

  if (sourceHandle === 'output' && targetHandle !== 'input') {
    return { isValid: false, message: 'Output must connect to input' };
  }

  if (
    (sourceHandle === 'true' || sourceHandle === 'false' || sourceHandle === 'error') &&
    targetHandle !== 'input'
  ) {
    return { isValid: false, message: 'Branch and error outputs must connect to an input port.' };
  }

  if (sourceHandle.startsWith('branch') && targetHandle !== 'input') {
    return { isValid: false, message: 'Parallel branches must connect to an input port.' };
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
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);

  return {
    id: `edge_${sourceId}_${sourceHandle || 'output'}_${targetId}_${targetHandle || 'input'}_${timestamp}_${random}`,
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
