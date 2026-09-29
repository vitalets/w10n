/**
 * Provides a controllable in-memory Chrome storage implementation for tests.
 */
import { vi } from 'vitest';

type StorageValues = Record<string, unknown>;
type StorageKeys = string | string[] | StorageValues | null | undefined;

/**
 * Installs stateful Chrome storage with optional outcomes queued for individual operations.
 */
export function installChromeStorage(initialValues: StorageValues = {}) {
  const storage = new ChromeStorage(initialValues);
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: storage.get, set: storage.set },
      onChanged: { addListener: vi.fn((listener) => storage.listeners.push(listener)) },
    },
  } as unknown as typeof chrome);
  return storage;
}

/**
 * Tracks local storage and controlled operation outcomes for consumers.
 */
class ChromeStorage {
  readonly values: StorageValues;
  readonly listeners: Array<Parameters<typeof chrome.storage.onChanged.addListener>[0]> = [];
  private getResults: Array<Promise<StorageValues> | StorageValues> = [];
  private setResults: Array<Promise<void>> = [];

  constructor(initialValues: StorageValues) {
    this.values = { ...initialValues };
  }

  /**
   * Reads requested values or the next queued outcome.
   */
  get = vi.fn(async (keys?: StorageKeys) => {
    const result = this.getResults.shift();
    return result === undefined ? selectValues(this.values, keys) : await result;
  });

  /**
   * Applies a write after its controlled outcome settles.
   */
  set = vi.fn(async (items: StorageValues) => {
    const result = this.setResults.shift();
    if (result) await result;
    Object.assign(this.values, items);
  });

  /**
   * Delivers an external storage update to registered listeners.
   */
  emitChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName = 'local',
  ) => {
    if (areaName === 'local') applyChanges(this.values, changes);
    for (const listener of this.listeners) listener(changes, areaName);
  };

  /**
   * Controls the next storage read.
   */
  queueGet = (result: Promise<StorageValues> | StorageValues) => {
    this.getResults.push(result);
  };

  /**
   * Controls the next storage write.
   */
  queueSet = (result: Promise<void>) => {
    this.setResults.push(result);
  };
}

/**
 * Selects the requested values using the forms accepted by the Chrome storage API.
 */
function selectValues(values: StorageValues, keys: StorageKeys) {
  if (keys == null) return { ...values };
  if (typeof keys === 'string') return pickValues(values, [keys]);
  if (Array.isArray(keys)) return pickValues(values, keys);

  return { ...keys, ...pickValues(values, Object.keys(keys)) };
}

/**
 * Updates stored values to reflect an externally emitted change.
 */
function applyChanges(
  values: StorageValues,
  changes: Record<string, chrome.storage.StorageChange>,
) {
  for (const [key, change] of Object.entries(changes)) {
    if (change.newValue === undefined) delete values[key];
    else values[key] = change.newValue;
  }
}

/**
 * Copies the requested keys that exist in storage.
 */
function pickValues(values: StorageValues, keys: string[]) {
  const result: StorageValues = {};
  for (const key of keys) {
    if (key in values) result[key] = values[key];
  }
  return result;
}
