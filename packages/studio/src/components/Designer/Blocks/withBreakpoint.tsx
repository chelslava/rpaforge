import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NodeProps } from '@reactflow/core';
import { useDebuggerStore } from '../../../stores/debuggerStore';
import { useExecutionStore } from '../../../stores/executionStore';
import type { Breakpoint } from '../../../types/engine';

interface WithBreakpointProps {
  nodeId: string;
  children: React.ReactNode;
}

function WithBreakpointComponent({ nodeId, children }: WithBreakpointProps) {
  const { t } = useTranslation('common');
  const breakpoints = useDebuggerStore((state) => state.breakpoints);
  const currentExecutingNodeId = useExecutionStore((state) => state.currentExecutingNodeId);
  const executionState = useExecutionStore((state) => state.executionState);

  const hasBreakpoint = Array.from(breakpoints.values()).some(
    (bp: Breakpoint) => bp.file === nodeId && bp.enabled
  );
  const isExecuting = currentExecutingNodeId === nodeId;
  const isPaused = executionState === 'paused';

  return (
    <div className="relative">
      {hasBreakpoint && (
        <div
          className="absolute -left-1 -top-1 w-4 h-4 bg-ui-danger rounded-full border-2 border-ui-surface shadow-sm z-10"
          title={t('breakpoints.breakpointSet')}
        />
      )}
      {isExecuting && !isPaused && (
        <div className="absolute inset-0 ring-2 ring-ui-primary ring-offset-2 rounded-lg pointer-events-none z-20 animate-pulse" />
      )}
      {isExecuting && isPaused && (
        <div className="absolute inset-0 ring-2 ring-ui-warning ring-offset-2 rounded-lg pointer-events-none z-20" />
      )}
      {children}
    </div>
  );
}

export const WithBreakpoint = memo(WithBreakpointComponent);

// eslint-disable-next-line react-refresh/only-export-components
export const withBreakpoint = <P extends NodeProps>(
  BlockComponent: React.ComponentType<P>
): React.ComponentType<P> => {
  const WrappedComponent = (props: P) => {
    return (
      <WithBreakpoint nodeId={props.id}>
        <BlockComponent {...props} />
      </WithBreakpoint>
    );
  };

  WrappedComponent.displayName = `withBreakpoint(${BlockComponent.displayName || BlockComponent.name})`;
  return memo(WrappedComponent);
};
