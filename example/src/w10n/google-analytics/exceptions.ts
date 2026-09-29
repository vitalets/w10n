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
  const reporter = new ExceptionReporter(options);
  return { sendException: reporter.sendException, captureExceptions: reporter.captureExceptions };
}

/**
 * Retains exception limits and listener ownership for one analytics client.
 */
class ExceptionReporter {
  private reported = new Set<string>();
  private stopCapture: (() => void) | undefined;

  constructor(private options: ReporterOptions) {}

  /**
   * Reports a manually caught value using the client's shared exception limits.
   */
  sendException = (reason: unknown) => {
    return this.report('caught_error', reason);
  };

  /**
   * Registers one pair of automatic listeners until their cleanup is invoked.
   */
  captureExceptions = () => {
    if (this.stopCapture) return this.stopCapture;
    globalThis.addEventListener('error', this.onError);
    globalThis.addEventListener('unhandledrejection', this.onRejection);
    let active = true;
    /**
     * Removes this registration without affecting manual reporting or later capture.
     */
    this.stopCapture = () => {
      if (!active) return;
      active = false;
      globalThis.removeEventListener('error', this.onError);
      globalThis.removeEventListener('unhandledrejection', this.onRejection);
      this.stopCapture = undefined;
    };
    return this.stopCapture;
  };

  /**
   * Normalizes and records a unique exception before dispatching it.
   */
  private async report(kind: ExceptionEvent['params']['error_kind'], reason: unknown) {
    if (!this.options.enabled) return false;
    try {
      let description = getDescription(reason);
      const stack = getStack(reason, description);
      description = preprocessDescription(description, this.options).slice(0, 100);
      const key = JSON.stringify([kind, description, stack]);
      if (!this.reserveReport(key)) return false;
      return await this.options.send('exception', {
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
   * Reserves a unique exception within the client's lifetime report limit.
   */
  private reserveReport(key: string) {
    if (this.reported.has(key) || this.reported.size >= 10) return false;
    this.reported.add(key);
    return true;
  }

  /**
   * Reports uncaught errors without intercepting normal browser error handling.
   */
  private onError = (event: ErrorEvent) => {
    if (event.error == null && !event.message) return;
    void this.report('uncaught_error', event.error ?? event.message);
  };

  /**
   * Reports unhandled rejections without marking them as handled in the browser.
   */
  private onRejection = (event: PromiseRejectionEvent) => {
    void this.report('unhandled_rejection', event.reason);
  };
}

/**
 * Applies optional message preprocessing while preserving the original on failure.
 */
function preprocessDescription(description: string, options: ReporterOptions) {
  if (!options.preprocess) return description;
  try {
    const replacement = options.preprocess(description);
    if (typeof replacement === 'string') return replacement;
    // Also contain an accidentally asynchronous JavaScript callback.
    void Promise.resolve(replacement).catch(ignoreResult);
    throw new Error('Invalid preprocessing result');
  } catch {
    options.onPreprocessingFailure();
    return description;
  }
}

/**
 * Extracts stack frames without repeating the original exception description.
 */
function getStack(reason: unknown, description: string) {
  try {
    const stack = reason instanceof Error ? reason.stack : undefined;
    if (typeof stack !== 'string') return;
    return normalizeStack(stack, description);
  } catch {
    return undefined;
  }
}

/**
 * Removes the description header and limits stack frames to the event budget.
 */
function normalizeStack(stack: string, description: string) {
  const lines = stack.split('\n');
  if (lines[0] === description) lines.shift();
  return lines.join('\n').slice(0, 100) || undefined;
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
    return stringifyReason(reason);
  }
}

/**
 * Falls back to a safe description when JSON conversion fails.
 */
function stringifyReason(reason: unknown) {
  try {
    return String(reason);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Contains rejected results from incorrectly asynchronous preprocessing callbacks.
 */
function ignoreResult() {}
