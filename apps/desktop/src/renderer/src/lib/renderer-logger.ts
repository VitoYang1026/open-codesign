/**
 * Renderer-process log bridge.
 *
 * `installRendererLogBridge()` is called once at app bootstrap. It:
 *   - patches console.warn / console.error to forward entries to the main
 *     process via `window.codesign.diagnostics.log`
 *   - listens for unhandled errors and promise rejections and forwards them too
 *
 * `rendererLogger` is a thin wrapper for business-side active logging that
 * goes through the same bridge.
 *
 * The bridge swallows its own errors (try/catch) to prevent IPC failures from
 * causing infinite recursion through the patched console methods.
 */

type LogLevel = 'info' | 'warn' | 'error';

function forward(
  level: LogLevel,
  scope: string,
  message: string,
  extra?: Record<string, unknown>,
  stack?: string,
): void {
  if (!window.codesign?.diagnostics?.log) return;
  try {
    void window.codesign.diagnostics.log({
      schemaVersion: 1,
      level,
      scope,
      message,
      ...(extra !== undefined ? { data: extra } : {}),
      ...(stack !== undefined ? { stack } : {}),
    });
  } catch {
    // Intentionally swallowed — IPC failure must not recurse through console.
  }
}

function makeReplacer() {
  const seen = new WeakSet<object>();
  return (_key: string, v: unknown): unknown => {
    if (typeof v === 'function') return '[fn]';
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) return '[circular]';
      seen.add(v as object);
    }
    return v;
  };
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value, makeReplacer());
  } catch {
    return '[unserializable]';
  }
}

let bridgeInstalled = false;

export function installRendererLogBridge(): void {
  if (bridgeInstalled) return;
  bridgeInstalled = true;

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]): void => {
    originalWarn(...args);
    try {
      forward('warn', 'console', args.map(safeStringify).join(' '));
    } catch {
      // swallow — never recurse
    }
  };

  console.error = (...args: unknown[]): void => {
    originalError(...args);
    try {
      forward('error', 'console', args.map(safeStringify).join(' '));
    } catch {
      // swallow — never recurse
    }
  };

  window.addEventListener('error', (event: ErrorEvent) => {
    try {
      forward(
        'error',
        'window',
        event.message,
        { filename: event.filename, lineno: event.lineno, colno: event.colno },
        event.error instanceof Error ? event.error.stack : undefined,
      );
    } catch {
      // swallow
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    try {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      forward('error', 'window', `Unhandled rejection: ${message}`, undefined, stack);
    } catch {
      // swallow
    }
  });
}

export const rendererLogger = {
  info: (scope: string, message: string, data?: Record<string, unknown>): void => {
    forward('info', scope, message, data);
  },
  warn: (scope: string, message: string, data?: Record<string, unknown>): void => {
    forward('warn', scope, message, data);
  },
  error: (scope: string, message: string, data?: Record<string, unknown>, stack?: string): void => {
    forward('error', scope, message, data, stack);
  },
};
