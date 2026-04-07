/**
 * RPAForge Python Bridge Client
 *
 * Works in both Electron and browser environments.
 * In Electron: uses IPC via window.rpaforge API
 * In browser: uses mock for development
 */

import type { EventListener } from '../types/events';
import type { ActivityBridgePayload } from '../types/engine';
import { generateClientRobotCode } from './clientCodegen';

export class PythonBridge {
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private isConnected = false;
  private unsubscribe: (() => void) | null = null;

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
        this.emitEvent(event.type, event);
      }
    });

    this.isConnected = true;
    this.emitEvent('connected', { electron: true });
    console.log('[PythonBridge] Electron mode connected');
  }

  private startMock(): void {
    this.isConnected = true;
    this.emitEvent('connected', { mock: true });
    console.log('[PythonBridge Mock] Started in browser mode');
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.isConnected = false;
    this.emitEvent('disconnected', {});
  }

  isReady(): boolean {
    if (this.isElectron() && window.rpaforge) {
      return this.isConnected;
    }
    return this.isConnected;
  }

  async checkReady(): Promise<boolean> {
    if (this.isElectron() && window.rpaforge) {
      const ready = await window.rpaforge.bridge.isReady();
      if (ready) {
        this.isConnected = true;
      }
      return ready;
    }
    return this.isConnected;
  }

  async sendRequest<T = unknown>(
    method: string,
    params: Record<string, unknown>,
    _timeout = 30000
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

    console.log(`[Mock] ${method}`, params);
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

  onEvent(eventType: string, listener: EventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)!.add(listener);

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
}
