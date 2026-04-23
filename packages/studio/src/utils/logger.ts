export type LoggerMethod = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, details?: unknown) => void;
  info: (message: string, details?: unknown) => void;
  warn: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
}

interface LoggerOptions {
  debugEnabled?: boolean;
}

function writeLog(
  method: Exclude<LoggerMethod, 'debug'> | 'log',
  scope: string,
  message: string,
  details?: unknown
): void {
  const formatted = `[${scope}] ${message}`;

  if (details === undefined) {
     
    console[method](formatted);
    return;
  }

   
  console[method](formatted, details);
}

export function createLogger(scope: string, options: LoggerOptions = {}): Logger {
  const debugEnabled =
    options.debugEnabled ?? process.env.NODE_ENV !== 'production';

  return {
    debug: (message, details) => {
      if (!debugEnabled) {
        return;
      }
      writeLog('log', scope, message, details);
    },
    info: (message, details) => writeLog('info', scope, message, details),
    warn: (message, details) => writeLog('warn', scope, message, details),
    error: (message, details) => writeLog('error', scope, message, details),
  };
}
