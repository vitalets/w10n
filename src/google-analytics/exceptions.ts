/**
 * Normalizes, preprocesses, and limits manual and automatically captured exceptions.
 */
export type ExceptionEvent = {
  name: 'exception';
  params: {
    description: string;
    stack?: string;
    error_kind: 'caught_error' | 'uncaught_error' | 'unhandled_rejection';
    fatal: false;
  };
};
type ReporterOptions = {
  enabled: boolean;
  send: (name: string, params: ExceptionEvent['params']) => Promise<boolean>;
  preprocess?: (message: string) => string;
  onPreprocessingFailure: () => void;
};

/**
 * Creates one exception reporter whose limits persist across capture registrations.
 */
export function createExceptionReporter(options: ReporterOptions) {
  const reported = new Set<string>();
  let stopCapture: (() => void) | undefined;
  return { sendException, captureExceptions };

  /**
   * Reports a manually caught value using the client's shared exception limits.
   */
  function sendException(reason: unknown) {
    return report('caught_error', reason);
  }

  /**
   * Registers one pair of automatic listeners until their cleanup is invoked.
   */
  function captureExceptions() {
    if (stopCapture) return stopCapture;
    globalThis.addEventListener('error', onError);
    globalThis.addEventListener('unhandledrejection', onRejection);
    let active = true;
    /**
     * Removes this registration without affecting manual reporting or later capture.
     */
    stopCapture = () => {
      if (!active) return;
      active = false;
      globalThis.removeEventListener('error', onError);
      globalThis.removeEventListener('unhandledrejection', onRejection);
      stopCapture = undefined;
    };
    return stopCapture;
  }

  /**
   * Normalizes and records a unique exception before dispatching it.
   */
  async function report(kind: ExceptionEvent['params']['error_kind'], reason: unknown) {
    if (!options.enabled) return false;
    try {
      let description = getDescription(reason);
      const stack = getStack(reason, description);
      if (options.preprocess) {
        try {
          const replacement = options.preprocess(description);
          if (typeof replacement !== 'string') {
            // Also contain an accidentally asynchronous JavaScript callback.
            void Promise.resolve(replacement).catch(ignoreResult);
            throw new Error('Invalid preprocessing result');
          }
          description = replacement;
        } catch {
          options.onPreprocessingFailure();
        }
      }
      description = description.slice(0, 100);
      const key = JSON.stringify([kind, description, stack]);
      if (reported.has(key) || reported.size >= 10) return false;
      reported.add(key);
      return await options.send('exception', {
        description,
        ...(stack ? { stack } : {}),
        error_kind: kind,
        fatal: false,
      });
    } catch {
      return false;
    }
  }

  /**
   * Reports uncaught errors without intercepting normal browser error handling.
   */
  function onError(event: ErrorEvent) {
    if (event.error == null && !event.message) return;
    void report('uncaught_error', event.error ?? event.message);
  }

  /**
   * Reports unhandled rejections without marking them as handled in the browser.
   */
  function onRejection(event: PromiseRejectionEvent) {
    void report('unhandled_rejection', event.reason);
  }
}

/**
 * Extracts stack frames without repeating the original exception description.
 */
function getStack(reason: unknown, description: string) {
  try {
    if (!(reason instanceof Error) || typeof reason.stack !== 'string') return;
    const lines = reason.stack.split('\n');
    if (lines[0] === description) lines.shift();
    return lines.join('\n').slice(0, 100) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Converts any caught value to a stable description without trusting conversions.
 */
function getDescription(reason: unknown) {
  try {
    if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
    if (typeof reason === 'string') return reason;
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    try {
      return String(reason);
    } catch {
      return 'Unknown error';
    }
  }
}

/**
 * Contains rejected results from incorrectly asynchronous preprocessing callbacks.
 */
function ignoreResult() {}
