import type { ActivityBridgePayload } from '../types/engine';
import type { BridgeEvent, BridgeStatus } from '../types/events';
import { config } from '../config/app.config';
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
      library: 'DesktopUI',
      type: 'sync',
      category: 'Desktop',
      description: 'Click on a UI element',
      tags: ['desktop', 'ui'],
      timeout_ms: 30000,
      has_retry: false,
      has_continue_on_error: true,
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
    },
    {
      id: 'BuiltIn.log',
      name: 'Log',
      library: 'BuiltIn',
      type: 'sync',
      category: 'BuiltIn',
      description: 'Log a message',
      tags: ['logging'],
      timeout_ms: 30000,
      has_retry: false,
      has_continue_on_error: true,
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
    },
  ];
}

export class MockBridgeAdapter implements BridgeAdapter {
  readonly transport = 'mock' as const;
  private connected = false;
  private status = createReadyStatus();

  async start(_onEvent: (event: BridgeEvent) => void): Promise<BridgeStatus> {
    this.connected = true;
    this.status = createReadyStatus();
    return this.status;
  }

  stop(): void {
    this.connected = false;
  }

  isReady(): boolean {
    return this.connected;
  }

  async checkReady(): Promise<BridgeStatus> {
    return this.status;
  }

  async send<T = unknown>(
    method: string,
    _params: Record<string, unknown>,
    _timeout = config.bridge.requestTimeoutMs
  ): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 50));

    const mockResponses: Record<string, unknown> = {
      ping: { pong: true, timestamp: Date.now() },
      getCapabilities: {
        version: '0.2.0',
        features: {
          debugger: true,
          breakpoints: true,
          stepping: true,
          variableWatching: true,
          nativePython: true,
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
        code: '# Generated Python code\n# Connect to Python bridge for actual code generation\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n',
        language: 'python',
      } as T;
    }

    return {} as T;
  }
}
