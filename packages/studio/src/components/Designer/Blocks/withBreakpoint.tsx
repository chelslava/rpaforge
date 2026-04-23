import { memo } from 'react';
import type { NodeProps } from '@reactflow/core';
import { useDebuggerStore } from '../../../stores/debuggerStore';
import { useProcessStore } from '../../../stores/processStore';
import type { Breakpoint } from '../../../types/engine';

interface WithBreakpointProps {
  nodeId: string;
  children: React.ReactNode;
}

function WithBreakpointComponent({ nodeId, children }: WithBreakpointProps) {
  const breakpoints = useDebuggerStore((state) => state.breakpoints);
  const currentExecutingNodeId = useProcessStore((state) => state.currentExecutingNodeId);

  const hasBreakpoint = Array.from(breakpoints.values()).some(
    (bp: Breakpoint) => bp.file === nodeId && bp.enabled
  );
  const isExecuting = currentExecutingNodeId === nodeId;

  return (
    <div className="relative">
      {hasBreakpoint && (
        <div
          className="absolute -left-1 -top-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm z-10"
          title="Breakpoint set"
        />
      )}
      {isExecuting && (
        <div className="absolute inset-0 ring-2 ring-indigo-500 ring-offset-2 rounded-lg pointer-events-none z-20 animate-pulse" />
      )}
      {children}
    </div>
  );
}

export const WithBreakpoint = memo(WithBreakpointComponent);

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
