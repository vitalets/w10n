/**
 * Provides console-compatible logging controlled by environment and extension storage settings.
 */
const storageKey = "logging-enabled";

export const enabledByEnv = booleanEnv(import.meta.env?.LOGGING);

declare global {
  interface ImportMetaEnv {
    readonly LOGGING?: string | boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

type LogMethod = "log" | "info" | "warn" | "error";
type BufferedWrite = readonly [method: LogMethod, args: readonly unknown[]];

const bufferedWrites: BufferedWrite[] = [];
let runtimeEnabled: boolean | undefined;
let loadPromise: Promise<boolean> | undefined;
let stateRevision = 0;

initLogging();

export const logger = {
  /**
   * Writes a standard log message when logging is enabled.
   */
  log: (...args: unknown[]) => write("log", args),

  /**
   * Writes an informational message when logging is enabled.
   */
  info: (...args: unknown[]) => write("info", args),

  /**
   * Writes a warning message when logging is enabled.
   */
  warn: (...args: unknown[]) => write("warn", args),

  /**
   * Writes an error message when logging is enabled.
   */
  error: (...args: unknown[]) => write("error", args),
};

/**
 * Changes logging immediately and persists the setting for all extension contexts.
 */
export function setLoggingEnabled(enabled: boolean) {
  stateRevision += 1;
  applyLoggingEnabled(enabled);
  try {
    return getStorage().local.set({ [storageKey]: enabled });
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Loads and applies the persisted logging setting while sharing active reads.
 */
export function loadLoggingEnabled() {
  if (loadPromise) return loadPromise;

  const revisionAtStart = stateRevision;
  const promise = Promise.resolve()
    .then(() => getStorage().local.get({ [storageKey]: false }))
    .then((data) => {
      const enabled = Boolean(data[storageKey]);
      if (stateRevision === revisionAtStart) applyLoggingEnabled(enabled);
      return enabled;
    })
    .catch((error: unknown) => {
      if (stateRevision === revisionAtStart) applyLoggingEnabled(false);
      reportAsyncError(error);
      throw error;
    })
    .finally(() => {
      if (loadPromise === promise) loadPromise = undefined;
    });

  loadPromise = promise;
  return promise;
}

/**
 * Starts storage synchronization and the initial logging-setting load.
 */
function initLogging() {
  try {
    getStorage().onChanged.addListener(handleStorageChanged);
    void loadLoggingEnabled().catch(() => undefined);
  } catch (error) {
    applyLoggingEnabled(false);
    reportAsyncError(error);
  }
}

/**
 * Applies relevant logging-setting changes received from extension storage.
 */
function handleStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: chrome.storage.AreaName,
) {
  if (areaName !== "local" || !(storageKey in changes)) return;
  stateRevision += 1;
  applyLoggingEnabled(Boolean(changes[storageKey]?.newValue));
}

/**
 * Updates runtime logging and resolves any writes buffered during startup.
 */
function applyLoggingEnabled(enabled: boolean) {
  runtimeEnabled = enabled;
  if (enabled) {
    for (const [method, args] of bufferedWrites) {
      globalThis.console[method](...args);
    }
  }
  bufferedWrites.length = 0;
}

/**
 * Sends a message to the requested console method or buffers it during startup.
 */
function write(method: LogMethod, args: readonly unknown[]) {
  if (enabledByEnv || runtimeEnabled) {
    globalThis.console[method](...args);
  } else if (runtimeEnabled === undefined) {
    bufferedWrites.push([method, args]);
  }
}

/**
 * Provides the Chrome storage API or reports that it is unavailable.
 */
function getStorage() {
  if (typeof chrome === "undefined" || !chrome.storage) {
    throw new Error("chrome.storage is unavailable");
  }
  return chrome.storage;
}

/**
 * Surfaces a storage failure asynchronously without blocking the current flow.
 */
function reportAsyncError(error: unknown) {
  const reportedError =
    error instanceof Error ? error : new Error(String(error));
  queueMicrotask(() => {
    throw reportedError;
  });
}

/**
 * Converts supported environment values into a logging-enabled boolean.
 */
function booleanEnv(value: unknown) {
  return value === true || value === "true" || value === "1";
}
