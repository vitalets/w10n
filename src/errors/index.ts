/**
 * Error helpers.
 */
const chromiumStackFramePattern = /^\s*at(?:\s|$)/;
const firefoxSafariStackFramePattern = /^(?:.*@)?\S+:\d+(?::\d+)?\s*$/;

/**
 * Runs a callback and rethrows its error with caller frames when the original stack has none.
 */
export async function withErrorStack<T>(callback: () => T | PromiseLike<T>) {
  const callSiteError = new Error();

  try {
    return await callback();
  } catch (error) {
    attachMissingStackFrames(error, callSiteError);
    throw error;
  }
}

/**
 * Runs a callback and suppresses either every error or errors with selected messages.
 */
export async function ignoreErrors<T>(
  callback: () => T | PromiseLike<T>,
  ignoredMessages?: readonly string[],
) {
  try {
    return await callback();
  } catch (error) {
    if (ignoredMessages === undefined || hasIgnoredErrorMessage(error, ignoredMessages)) return;
    throw error;
  }
}

/**
 * Adds captured caller frames without allowing enrichment failures to replace the original error.
 */
function attachMissingStackFrames(error: unknown, callSiteError: Error) {
  try {
    if (!error || typeof error !== 'object') return;

    const errorWithStack = error as { stack?: unknown; name?: unknown; message?: unknown };
    const stack = errorWithStack.stack;
    if (hasStackFrames(stack)) return;

    const callerFrames = getCallerFrames(callSiteError.stack);
    if (!callerFrames.length) return;

    const errorHeader = stack || buildErrorHeader(errorWithStack);
    errorWithStack.stack = [errorHeader, ...callerFrames].join('\n');
  } catch {
    // Stack enrichment must never replace or mask the original error.
  }
}

/**
 * Returns the captured frames below the wrapper's own frame.
 */
function getCallerFrames(stack: unknown) {
  if (typeof stack !== 'string') return [];

  const lines = stack.split('\n');
  const wrapperFrameIndex = lines.findIndex(isStackFrame);
  return wrapperFrameIndex === -1 ? [] : lines.slice(wrapperFrameIndex + 1);
}

/**
 * Builds a conventional error header for an object without a usable stack string.
 */
function buildErrorHeader(error: { name?: unknown; message?: unknown }) {
  return `${error.name || 'Error'}: ${error.message || String(error)}`;
}

/**
 * Reports whether a thrown value has a message selected for suppression.
 */
function hasIgnoredErrorMessage(error: unknown, ignoredMessages: readonly string[]) {
  try {
    if (typeof error === 'string') return ignoredMessages.includes(error);
    if (!error || typeof error !== 'object') return false;

    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && ignoredMessages.includes(message);
  } catch {
    return false;
  }
}

/**
 * Reports whether a stack contains a recognized browser frame.
 */
function hasStackFrames(stack: unknown) {
  return typeof stack === 'string' && stack.split('\n').some(isStackFrame);
}

/**
 * Recognizes common Chromium, Firefox, and Safari stack-frame formats.
 */
function isStackFrame(line: string) {
  return chromiumStackFramePattern.test(line) || firefoxSafariStackFramePattern.test(line);
}
