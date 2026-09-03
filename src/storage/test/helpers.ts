/**
 * Provides controllable native storage areas for storage-item tests.
 */
import { vi } from 'vitest';

type StorageValues = Record<string, unknown>;
type StorageAreaName = 'local' | 'session' | 'sync';
type StorageChangeListener = (changes: Record<string, chrome.storage.StorageChange>) => void;

/**
 * Installs independent local, session, and sync storage areas.
 */
export function installChromeStorage(
  initialValues: Partial<Record<StorageAreaName, StorageValues>> = {},
) {
  const local = createStorageArea(initialValues.local);
  const session = createStorageArea(initialValues.session);
  const sync = createStorageArea(initialValues.sync);

  vi.stubGlobal('chrome', {
    storage: {
      local,
      session,
      sync,
    },
  } as unknown as typeof chrome);

  return { local, session, sync };
}

/**
 * Restores globals and spies changed by a storage-item test.
 */
export function cleanupStorage() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

/**
 * Creates a promise together with its externally controlled settlement functions.
 */
export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

/**
 * Creates one stateful storage area with controllable operation outcomes.
 */
function createStorageArea(initialValues: StorageValues = {}) {
  const values = structuredClone(initialValues);
  const getResults: Array<Promise<StorageValues> | StorageValues> = [];
  const removeResults: Array<Promise<void>> = [];
  const setResults: Array<Promise<void>> = [];
  const listeners = new Set<StorageChangeListener>();

  const get = vi.fn(async (key: string) => {
    if (getResults.length > 0) return structuredClone(await getResults.shift()!);
    return key in values ? { [key]: structuredClone(values[key]) } : {};
  });

  const set = vi.fn(async (items: StorageValues) => {
    if (setResults.length > 0) await setResults.shift();

    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = createStorageChange(values, key, value);
      values[key] = structuredClone(value);
    }
    emitChanges(listeners, changes);
  });

  const remove = vi.fn(async (key: string) => {
    if (removeResults.length > 0) await removeResults.shift();
    if (!(key in values)) return;

    const changes = { [key]: { oldValue: structuredClone(values[key]) } };
    delete values[key];
    emitChanges(listeners, changes);
  });

  return {
    emitChange(changes: Record<string, chrome.storage.StorageChange>) {
      applyChanges(values, changes);
      emitChanges(listeners, changes);
    },
    get,
    queueGet(result: Promise<StorageValues> | StorageValues) {
      getResults.push(result);
    },
    queueRemove(result: Promise<void>) {
      removeResults.push(result);
    },
    queueSet(result: Promise<void>) {
      setResults.push(result);
    },
    remove,
    set,
    values,
    onChanged: {
      addListener: vi.fn((listener: StorageChangeListener) => listeners.add(listener)),
      removeListener: vi.fn((listener: StorageChangeListener) => listeners.delete(listener)),
    },
  };
}

/**
 * Creates the native change payload for a stored value.
 */
function createStorageChange(values: StorageValues, key: string, newValue: unknown) {
  const change: chrome.storage.StorageChange = { newValue: structuredClone(newValue) };
  if (key in values) change.oldValue = structuredClone(values[key]);
  return change;
}

/**
 * Applies external storage changes to the in-memory area.
 */
function applyChanges(
  values: StorageValues,
  changes: Record<string, chrome.storage.StorageChange>,
) {
  for (const [key, change] of Object.entries(changes)) {
    if (change.newValue === undefined) delete values[key];
    else values[key] = structuredClone(change.newValue);
  }
}

/**
 * Delivers a change payload to every listener registered on an area.
 */
function emitChanges(
  listeners: Set<StorageChangeListener>,
  changes: Record<string, chrome.storage.StorageChange>,
) {
  for (const listener of listeners) listener(changes);
}
