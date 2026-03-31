import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';

interface IPCMessage {
  method: string;
  params: Record<string, unknown>;
  id?: string;
}

interface IPCResponse {
  result?: unknown;
  error?: string;
  id?: string;
}

export class PythonBridge {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private buffer: string = '';
  private messageId = 0;

  async start(): Promise<void> {
    const pythonPath = this.getPythonPath();
    const scriptPath = path.join(
      app.getAppPath(),
      'python',
      'bridge_server.py'
    );

    this.process = spawn(pythonPath, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('Python stderr:', data.toString());
    });

    this.process.on('close', (code) => {
      console.log('Python process closed:', code);
      this.process = null;
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  send(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Python process not running'));
        return;
      }

      const id = `msg_${++this.messageId}`;
      const message: IPCMessage = { method, params, id };

      this.pendingRequests.set(id, { resolve, reject });

      const json = JSON.stringify(message) + '\n';
      this.process.stdin?.write(json);

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response: IPCResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id || '');

        if (pending) {
          this.pendingRequests.delete(response.id || '');
          if (response.error) {
            pending.reject(new Error(response.error));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (e) {
        console.error('Failed to parse response:', line, e);
      }
    }
  }

  private getPythonPath(): string {
    if (process.platform === 'win32') {
      return 'python';
    }
    return 'python3';
  }
}
