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
  return new StorageArea(initialValues);
}

/**
 * Models one native storage area with queued outcomes and change listeners.
 */
class StorageArea {
  readonly values: StorageValues;
  private getResults: Array<Promise<StorageValues> | StorageValues> = [];
  private removeResults: Array<Promise<void>> = [];
  private setResults: Array<Promise<void>> = [];
  private listeners = new Set<StorageChangeListener>();

  constructor(initialValues: StorageValues) {
    this.values = structuredClone(initialValues);
  }

  /**
   * Reads stored values or the next controlled result.
   */
  get = vi.fn(async (key: string) => {
    if (this.getResults.length > 0) return structuredClone(await this.getResults.shift()!);
    return key in this.values ? { [key]: structuredClone(this.values[key]) } : {};
  });

  /**
   * Stores values and delivers their native change events.
   */
  set = vi.fn(async (items: StorageValues) => {
    if (this.setResults.length > 0) await this.setResults.shift();
    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = createStorageChange(this.values, key, value);
      this.values[key] = structuredClone(value);
    }
    emitChanges(this.listeners, changes);
  });

  /**
   * Removes a stored value and delivers its native change event.
   */
  remove = vi.fn(async (key: string) => {
    if (this.removeResults.length > 0) await this.removeResults.shift();
    if (!(key in this.values)) return;
    const changes = { [key]: { oldValue: structuredClone(this.values[key]) } };
    delete this.values[key];
    emitChanges(this.listeners, changes);
  });

  /**
   * Applies an external update and notifies registered listeners.
   */
  emitChange(changes: Record<string, chrome.storage.StorageChange>) {
    applyChanges(this.values, changes);
    emitChanges(this.listeners, changes);
  }

  /**
   * Controls the next storage read.
   */
  queueGet(result: Promise<StorageValues> | StorageValues) {
    this.getResults.push(result);
  }

  /**
   * Controls the next storage removal.
   */
  queueRemove(result: Promise<void>) {
    this.removeResults.push(result);
  }

  /**
   * Controls the next storage write.
   */
  queueSet(result: Promise<void>) {
    this.setResults.push(result);
  }

  onChanged = {
    addListener: vi.fn((listener: StorageChangeListener) => this.listeners.add(listener)),
    removeListener: vi.fn((listener: StorageChangeListener) => this.listeners.delete(listener)),
  };
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
 * Creates the native change payload for a stored value.
 */
function createStorageChange(values: StorageValues, key: string, newValue: unknown) {
  const change: chrome.storage.StorageChange = { newValue: structuredClone(newValue) };
  if (key in values) change.oldValue = structuredClone(values[key]);
  return change;
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
