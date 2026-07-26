export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  details?: unknown;
}

export interface Logger {
  debug: (message: string, details?: unknown) => void;
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
}

interface LoggerOptions {
  debugEnabled?: boolean;
}

const LOG_BUFFER_SIZE = 1000;
const logBuffer: LogEntry[] = [];
let logIdCounter = 0;

function generateLogId(): string {
  return `log_${Date.now()}_${++logIdCounter}`;
}

export function addToBuffer(entry: Omit<LogEntry, 'id'>): LogEntry {
  const fullEntry: LogEntry = { ...entry, id: generateLogId() };

  logBuffer.push(fullEntry);

  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }

  return fullEntry;
}

export function getLogs(filter?: { level?: LogLevel; scope?: string }): LogEntry[] {
  let filtered = logBuffer;

  if (filter?.level) {
    filtered = filtered.filter((e) => e.level === filter.level);
  }

  if (filter?.scope) {
    filtered = filtered.filter((e) => e.scope === filter.scope);
  }

  return filtered;
}

export function exportLogs(format: 'json' | 'text' = 'json'): string {
  if (format === 'json') {
    return JSON.stringify(logBuffer, null, 2);
  }

  return logBuffer
    .map((e) => `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.scope}] ${e.message}`)
    .join('\n');
}

export function clearLogs(): void {
  logBuffer.length = 0;
}

export function getLogStats(): { count: number; byLevel: Record<LogLevel, number> } {
  const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };

  for (const entry of logBuffer) {
    byLevel[entry.level]++;
  }

  return { count: logBuffer.length, byLevel };
}

function writeToConsole(
  method: Exclude<LogLevel, 'debug'> | 'log',
  scope: string,
  message: string,
  details?: unknown
): void {
  const formatted = `[${scope}] ${message}`;

  if (details === undefined) {
    // This is the single console boundary used by the logger; debug is filtered in production.
    // eslint-disable-next-line no-console
    console[method](formatted);
    return;
  }

  // This is the single console boundary used by the logger; debug is filtered in production.
  // eslint-disable-next-line no-console
  console[method](formatted, details);
}

function sendToMain(level: LogLevel, scope: string, message: string, details?: unknown): void {
  if (typeof window !== 'undefined' && window.rpaforge?.log) {
    window.rpaforge.log.log({ level, scope, message, details });
  }
}

export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const debugEnabled =
    options.debugEnabled ?? process.env.NODE_ENV !== 'production';

  return {
    debug: (message, details) => {
      if (!debugEnabled) return;

      const timestamp = new Date().toISOString();
      const entry = addToBuffer({ timestamp, level: 'debug', scope, message, details });
      writeToConsole('log', scope, message, details);
      void entry;
    },

    info: (message, details) => {
      const timestamp = new Date().toISOString();
      const entry = addToBuffer({ timestamp, level: 'info', scope, message, details });
      writeToConsole('info', scope, message, details);
      sendToMain('info', scope, message, details);
      void entry;
    },

    warn: (message, details) => {
      const timestamp = new Date().toISOString();
      const entry = addToBuffer({ timestamp, level: 'warn', scope, message, details });
      writeToConsole('warn', scope, message, details);
      sendToMain('warn', scope, message, details);
      void entry;
    },

    error: (message, details) => {
      const timestamp = new Date().toISOString();
      const entry = addToBuffer({ timestamp, level: 'error', scope, message, details });
      writeToConsole('error', scope, message, details);
      sendToMain('error', scope, message, details);
      void entry;
    },
  };
}

export function setupGlobalErrorHandler(logger: Logger): () => void {
  const errorHandler = (event: ErrorEvent) => {
    logger.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    logger.error('Unhandled promise rejection', {
      reason: event.reason,
    });
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  return () => {
    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
}
