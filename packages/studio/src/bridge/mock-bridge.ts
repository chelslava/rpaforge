import type { ActivityBridgePayload } from '../types/engine';
import type { BridgeEvent, BridgeStatus } from '../types/events';
import { config } from '../config/app.config';
import { generateClientRobotCode } from '../utils/clientCodegen';
import type { BridgeAdapter } from './types';

function createReadyStatus(): BridgeStatus {
  return {
    timestamp: new Date().toISOString(),
    state: 'ready',
    previousState: 'stopped',
    isOperational: true,
    maxReconnectAttempts: config.bridge.maxReconnectAttempts,
    consecutiveHeartbeatFailures: 0,
    fatal: false,
    reason: 'ready_check',
  };
}

function getMockActivities(): ActivityBridgePayload[] {
  return [
    {
      id: 'DesktopUI.click_element',
      name: 'Click Element',
      type: 'sync',
      category: 'Desktop',
      description: 'Click on a UI element',
      icon: '🖱',
      ports: {
        inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
        outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
      },
      params: [
        {
          name: 'selector',
          type: 'string',
          label: 'Selector',
          description: 'UI selector for the target element.',
          required: true,
          options: [],
        },
      ],
      builtin: {
        timeout: true,
        continueOnError: true,
      },
      robotFramework: {
        keyword: 'Click Element',
        library: 'DesktopUI',
      },
    },
    {
      id: 'BuiltIn.log',
      name: 'Log',
      type: 'sync',
      category: 'BuiltIn',
      description: 'Log a message',
      icon: '📝',
      ports: {
        inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
        outputs: [{ id: 'output', type: 'flow', label: 'Output', required: true }],
      },
      params: [
        {
          name: 'message',
          type: 'string',
          label: 'Message',
          description: 'Message to log.',
          required: true,
          options: [],
        },
      ],
      builtin: {
        timeout: false,
        continueOnError: true,
      },
      robotFramework: {
        keyword: 'Log',
        library: 'BuiltIn',
      },
    },
  ];
}

export class MockBridgeAdapter implements BridgeAdapter {
  readonly transport = 'mock' as const;
  private connected = false;
  private status = createReadyStatus();
  private onEvent: ((event: BridgeEvent) => void) | null = null;

  async start(onEvent: (event: BridgeEvent) => void): Promise<BridgeStatus> {
    this.onEvent = onEvent;
    this.connected = true;
    this.status = createReadyStatus();
    return this.status;
  }

  stop(): void {
    this.connected = false;
    this.onEvent = null;
  }

  isReady(): boolean {
    return this.connected;
  }

  async checkReady(): Promise<BridgeStatus> {
    return this.status;
  }

  async send<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    _timeout = config.bridge.requestTimeoutMs
  ): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const mockResponses: Record<string, unknown> = {
      ping: { pong: true, timestamp: Date.now() },
      getCapabilities: {
        version: '0.1.0',
        features: {
          debugger: true,
          breakpoints: true,
          stepping: true,
          variableWatching: true,
        },
        libraries: ['DesktopUI', 'WebUI', 'BuiltIn'],
      },
      getActivities: { activities: getMockActivities() },
      getVariables: { variables: [] },
      getCallStack: { callStack: [] },
      getBreakpoints: { breakpoints: [] },
    };

    if (method in mockResponses) {
      return mockResponses[method] as T;
    }

    if (method === 'generateCode') {
      return {
        code: generateClientRobotCode({
          nodes: ((params.diagram as { nodes?: unknown[] } | undefined)?.nodes || []) as never,
          edges: ((params.diagram as { edges?: unknown[] } | undefined)?.edges || []) as never,
          metadata: (params.diagram as { metadata?: Record<string, unknown> } | undefined)?.metadata as never,
          activeDiagramId: (params.diagram as { activeDiagramId?: string } | undefined)?.activeDiagramId,
          project: (params.diagram as { project?: Record<string, unknown> } | undefined)?.project as never,
          diagramDocuments: (params.diagram as { diagramDocuments?: Record<string, unknown> } | undefined)?.diagramDocuments as never,
        }),
        language: 'robot',
      } as T;
    }

    return {} as T;
  }
}
