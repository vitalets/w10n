/**
 * Provides console-compatible logging with an environment default that can be replaced from extension storage.
 */

/**
 * Identifies the persisted logging preference.
 */
const storageKey = 'loggingEnabled';
/**
 * Supplies the logging preference when storage has no saved value.
 */
const defaultLoggingEnabled = booleanEnv(import.meta.env?.LOGGING);

/**
 * Retains log messages until the initial logging preference is resolved.
 */
const buffer: BufferedWrite[] = [];

declare global {
  interface ImportMeta {
    readonly env: {
      readonly LOGGING?: string | boolean;
    };
  }
}

type LogMethod = 'log' | 'info' | 'warn' | 'error';
type BufferedWrite = readonly [method: LogMethod, args: readonly unknown[]];

let loggingEnabled: boolean | undefined;
let stateRevision = 0;

/**
 * Provides console-compatible methods governed by the logging preference.
 */
export const logger = {
  /**
   * Writes a standard log message when logging is enabled.
   */
  log: (...args: unknown[]) => write('log', args),

  /**
   * Writes an informational message when logging is enabled.
   */
  info: (...args: unknown[]) => write('info', args),

  /**
   * Writes a warning message when logging is enabled.
   */
  warn: (...args: unknown[]) => write('warn', args),

  /**
   * Writes an error message when logging is enabled.
   */
  error: (...args: unknown[]) => write('error', args),
};

/**
 * Applies the logging setting immediately and persists it for future loads.
 */
export function setLoggingEnabled(enabled: boolean) {
  stateRevision += 1;
  applyLoggingEnabled(enabled);
  return chrome.storage.local.set({ [storageKey]: enabled });
}

/**
 * Loads and applies the logging setting, falling back to the environment default.
 */
export async function loadLoggingEnabled() {
  const revisionAtStart = stateRevision;
  try {
    const data = await chrome.storage.local.get({
      [storageKey]: defaultLoggingEnabled,
    });
    const enabled = Boolean(data[storageKey]);
    if (stateRevision === revisionAtStart) applyLoggingEnabled(enabled);
    return enabled;
  } catch (error) {
    if (stateRevision === revisionAtStart && loggingEnabled === undefined) {
      applyLoggingEnabled(defaultLoggingEnabled);
    }
    globalThis.console.error(error);
  }
}

/**
 * Applies the loaded setting and resolves any writes buffered during startup.
 */
function applyLoggingEnabled(enabled: boolean) {
  loggingEnabled = enabled;
  if (enabled) {
    for (const [method, args] of buffer) {
      globalThis.console[method](...args);
    }
  }
  buffer.length = 0;
}

/**
 * Sends a message when logging is enabled or buffers it before the first load.
 */
function write(method: LogMethod, args: readonly unknown[]) {
  if (loggingEnabled) {
    globalThis.console[method](...args);
  } else if (loggingEnabled === undefined) {
    buffer.push([method, args]);
  }
}

/**
 * Converts supported environment values into a logging-enabled boolean.
 */
function booleanEnv(value: unknown) {
  return value === true || value === 'true' || value === '1';
}
