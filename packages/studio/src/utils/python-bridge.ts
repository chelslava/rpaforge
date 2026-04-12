/**
 * RPAForge Python Bridge Client
 *
 * Works in both Electron and browser environments.
 * In Electron: uses IPC via window.rpaforge API
 * In browser: uses mock for development
 */

import type {
  BridgeEvent,
  BridgeState,
  BridgeStatus,
} from '../types/events';
import type { ActivityBridgePayload } from '../types/engine';
import { generateClientRobotCode } from './clientCodegen';
import { config } from '../config/app.config';

type ClientBridgeEvent =
  | BridgeEvent
  | {
      type: 'connected';
      timestamp: string;
      transport: 'electron' | 'mock';
      state: BridgeState;
    }
  | {
      type: 'disconnected';
      timestamp: string;
      transport: 'electron' | 'mock';
      state: BridgeState;
    };

type ClientEventListener = (event: ClientBridgeEvent) => void;

export class PythonBridge {
  private eventListeners: Map<string, Set<ClientEventListener>> = new Map();
  private isConnected = false;
  private unsubscribe: (() => void) | null = null;
  private bridgeState: BridgeState = 'stopped';

  async start(): Promise<void> {
    if (this.isElectron()) {
      await this.startElectron();
    } else {
      this.startMock();
    }
  }

  private isElectron(): boolean {
    return typeof window !== 'undefined' && window.rpaforge !== undefined;
  }

  private async startElectron(): Promise<void> {
    if (!window.rpaforge) {
      throw new Error('Electron API not available');
    }

    this.unsubscribe = window.rpaforge.bridge.onEvent((event) => {
      if ('type' in event) {
        if (event.type === 'bridgeState') {
          this.applyBridgeStatus(event);
        }
        this.emitEvent(event.type, event);
      }
    });

    const status = await window.rpaforge.bridge.getStatus();
    this.applyBridgeStatus(status);
    this.emitEvent('bridgeState', {
      type: 'bridgeState',
      ...status,
    });
  }

  private startMock(): void {
    const status: BridgeStatus = {
      timestamp: new Date().toISOString(),
      state: 'ready',
      previousState: 'stopped',
      isOperational: true,
      maxReconnectAttempts: config.bridge.maxReconnectAttempts,
      consecutiveHeartbeatFailures: 0,
      fatal: false,
      reason: 'ready_check',
    };

    this.applyBridgeStatus(status);
    this.emitEvent('bridgeState', {
      type: 'bridgeState',
      ...status,
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (this.isConnected) {
      this.emitEvent('disconnected', {
        type: 'disconnected',
        timestamp: new Date().toISOString(),
        transport: this.isElectron() ? 'electron' : 'mock',
        state: this.bridgeState,
      });
    }

    this.isConnected = false;
    this.bridgeState = 'stopped';
  }

  isReady(): boolean {
    return this.isConnected;
  }

  async checkReady(): Promise<boolean> {
    if (this.isElectron() && window.rpaforge) {
      const status = await window.rpaforge.bridge.getStatus();
      this.applyBridgeStatus(status);
      return status.isOperational;
    }
    return this.isConnected;
  }

  async sendRequest<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    _timeout = config.bridge.requestTimeoutMs
  ): Promise<T> {
    if (this.isElectron() && window.rpaforge) {
      return window.rpaforge.bridge.send(method, params) as Promise<T>;
    }

    if (!this.isConnected) {
      throw new Error('Not connected');
    }

    return this.mockRequest<T>(method, params);
  }

  private async mockRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mockResponses: Record<string, unknown> = {
      ping: { pong: true, timestamp: Date.now() },
      getCapabilities: {
        engine: 'RPAForge',
        version: '0.1.0',
        features: ['run', 'debug', 'recorder'],
      },
      getActivities: { activities: this.getMockActivities() },
      getVariables: {},
      getCallStack: [],
      getBreakpoints: [],
    };

    if (method in mockResponses) {
      return mockResponses[method] as T;
    }

    if (method === 'generateCode') {
      return {
        code: this.generateMockCode(params.diagram as { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> } | undefined),
        language: 'robot',
      } as T;
    }
    return {} as T;
  }

  private generateMockCode(
    diagram?: { nodes?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> }
  ): string {
    return generateClientRobotCode({
      nodes: (diagram?.nodes || []) as never,
      edges: (diagram?.edges || []) as never,
    });
  }

  private getMockActivities(): ActivityBridgePayload[] {
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
        id: 'DesktopUI.input_text',
        name: 'Input Text',
        type: 'sync',
        category: 'Desktop',
        description: 'Type text into element',
        icon: '⌨',
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
          {
            name: 'text',
            type: 'string',
            label: 'Text',
            description: 'Text to type into the element.',
            required: true,
            options: [],
          },
        ],
        builtin: {
          timeout: true,
          continueOnError: true,
        },
        robotFramework: {
          keyword: 'Input Text',
          library: 'DesktopUI',
        },
      },
      {
        id: 'WebUI.open_browser',
        name: 'Open Browser',
        type: 'sync',
        category: 'Web',
        description: 'Open a web browser',
        icon: '🌐',
        ports: {
          inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
          outputs: [{ id: 'success', type: 'flow', label: 'Success', required: true }],
        },
        params: [
          {
            name: 'url',
            type: 'string',
            label: 'URL',
            description: 'Target URL.',
            required: true,
            options: [],
          },
          {
            name: 'browser',
            type: 'string',
            label: 'Browser',
            description: 'Browser engine to launch.',
            required: false,
            default: 'chromium',
            options: ['chromium', 'firefox', 'webkit'],
          },
        ],
        builtin: {
          timeout: true,
        },
        robotFramework: {
          keyword: 'Open Browser',
          library: 'WebUI',
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
      {
        id: 'BuiltIn.if',
        name: 'If',
        type: 'condition',
        category: 'BuiltIn',
        description: 'Branch execution based on a condition.',
        icon: '◆',
        ports: {
          inputs: [{ id: 'input', type: 'flow', label: 'Input', required: true }],
          outputs: [
            { id: 'true', type: 'flow', label: 'True', required: true },
            { id: 'false', type: 'flow', label: 'False', required: true },
          ],
        },
        params: [
          {
            name: 'condition',
            type: 'expression',
            label: 'Condition',
            description: 'Expression evaluated by the IF block.',
            required: true,
            default: '${True}',
            options: [],
          },
        ],
        builtin: {
          timeout: false,
        },
        robotFramework: {
          keyword: 'IF',
          library: 'BuiltIn',
        },
      },
    ];
  }

  onEvent(eventType: string, listener: ClientEventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)?.add(listener);

    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  private emitEvent(eventType: string, event: unknown): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event as never);
        } catch (e) {
          console.error(`[PythonBridge] Event listener error:`, e);
        }
      });
    }

    const allListeners = this.eventListeners.get('*');
    if (allListeners) {
      allListeners.forEach((listener) => {
        try {
          listener(event as never);
        } catch (e) {
          console.error(`[PythonBridge] Event listener error:`, e);
        }
      });
    }
  }

  private applyBridgeStatus(status: BridgeStatus): void {
    this.bridgeState = status.state;
    const nextIsConnected = status.isOperational;

    if (nextIsConnected === this.isConnected) {
      this.isConnected = nextIsConnected;
      return;
    }

    this.isConnected = nextIsConnected;

    this.emitEvent(nextIsConnected ? 'connected' : 'disconnected', {
      type: nextIsConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      transport: this.isElectron() ? 'electron' : 'mock',
      state: status.state,
    });
  }
}
