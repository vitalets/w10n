const storageKey = "logging-enabled";

export const forceEnabled = booleanEnv(import.meta.env?.LOGGING_ENABLED);

declare global {
  interface ImportMetaEnv {
    readonly LOGGING_ENABLED?: string | boolean;
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
  log: (...args: unknown[]) => write("log", args),
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};

/** Changes logging immediately and persists the setting for all extension contexts. */
export function setLoggingEnabled(enabled: boolean): Promise<void> {
  stateRevision += 1;
  applyLoggingEnabled(enabled);
  try {
    return getStorage().local.set({ [storageKey]: enabled });
  } catch (error) {
    return Promise.reject(error);
  }
}

export function loadLoggingEnabled(): Promise<boolean> {
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
      reportAsyncError(error);
      throw error;
    })
    .finally(() => {
      if (loadPromise === promise) loadPromise = undefined;
    });

  loadPromise = promise;
  return promise;
}

function booleanEnv(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function initLogging(): void {
  try {
    getStorage().onChanged.addListener(handleStorageChanged);
    const revisionAtStart = stateRevision;
    void loadLoggingEnabled().catch(() => {
      if (stateRevision === revisionAtStart) applyLoggingEnabled(false);
    });
  } catch (error) {
    applyLoggingEnabled(false);
    reportAsyncError(error);
  }
}

function getStorage(): typeof chrome.storage {
  if (typeof chrome === "undefined" || !chrome.storage) {
    throw new Error("chrome.storage is unavailable");
  }
  return chrome.storage;
}

function handleStorageChanged(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: chrome.storage.AreaName,
): void {
  if (areaName !== "local" || !(storageKey in changes)) return;
  stateRevision += 1;
  applyLoggingEnabled(Boolean(changes[storageKey]?.newValue));
}

function reportAsyncError(error: unknown): void {
  const reportedError =
    error instanceof Error ? error : new Error(String(error));
  queueMicrotask(() => {
    throw reportedError;
  });
}

function applyLoggingEnabled(enabled: boolean): void {
  runtimeEnabled = enabled;
  if (enabled) {
    for (const [method, args] of bufferedWrites) {
      globalThis.console[method](...args);
    }
  }
  bufferedWrites.length = 0;
}

function write(method: LogMethod, args: readonly unknown[]): void {
  if (forceEnabled || runtimeEnabled) {
    globalThis.console[method](...args);
  } else if (runtimeEnabled === undefined) {
    bufferedWrites.push([method, args]);
  }
}
