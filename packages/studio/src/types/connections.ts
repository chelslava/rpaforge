import type { Edge } from '@xyflow/react';

export type ConnectionType =
  | 'normal'
  | 'true'
  | 'false'
  | 'error'
  | 'parallel';

export interface ConnectionData extends Record<string, unknown> {
  type: ConnectionType;
  label?: string;
  animated?: boolean;
}

export interface ConnectionValidation {
  isValid: boolean;
  /** i18n key (namespace `common`) resolved by the caller, e.g. `canvas.connectionExplicitPorts`. */
  messageKey?: string;
}

export const CONNECTION_STYLES: Record<ConnectionType, {
  color: string;
  strokeWidth: number;
  strokeDasharray?: string;
  animated?: boolean;
}> = {
  normal: {
    color: 'var(--color-port-default)',
    strokeWidth: 2,
  },
  true: {
    color: 'var(--color-port-true)',
    strokeWidth: 2,
  },
  false: {
    color: 'var(--color-port-false)',
    strokeWidth: 2,
    strokeDasharray: '5,5',
  },
  error: {
    color: 'var(--color-port-error)',
    strokeWidth: 2,
    strokeDasharray: '2,2',
  },
  parallel: {
    color: 'var(--color-port-branch)',
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
    return { isValid: false, messageKey: 'canvas.connectionExplicitPorts' };
  }

  if (sourceType === 'end') {
    return { isValid: false, messageKey: 'canvas.endOutgoing' };
  }

  if (targetType === 'start') {
    return { isValid: false, messageKey: 'canvas.startIncoming' };
  }

  if (sourceType === 'start' && sourceHandle !== 'output') {
    return { isValid: false, messageKey: 'canvas.startOnlyOutput' };
  }

  if (targetType === 'end' && targetHandle !== 'input') {
    return { isValid: false, messageKey: 'canvas.endOnlyInput' };
  }

  if (sourceHandle === 'output' && targetHandle !== 'input') {
    return { isValid: false, messageKey: 'canvas.outputToInput' };
  }

  if (
    (sourceHandle === 'true' || sourceHandle === 'false' || sourceHandle === 'error') &&
    targetHandle !== 'input'
  ) {
    return { isValid: false, messageKey: 'canvas.branchErrorToInput' };
  }

  if (sourceHandle.startsWith('branch') && targetHandle !== 'input') {
    return { isValid: false, messageKey: 'canvas.parallelBranchesToInput' };
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
    id: `edge_${sourceId}_${sourceHandle || 'output'}_${targetId}_${targetHandle || 'input'}_${crypto.randomUUID()}`,
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
