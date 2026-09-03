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
  const values: StorageValues = { ...initialValues };
  const getResults: Array<Promise<StorageValues> | StorageValues> = [];
  const setResults: Array<Promise<void>> = [];
  const listeners: Array<Parameters<typeof chrome.storage.onChanged.addListener>[0]> = [];

  const get = vi.fn(async (keys?: StorageKeys) => {
    const result = getResults.shift();
    return result === undefined ? selectValues(values, keys) : await result;
  });
  const set = vi.fn(async (items: StorageValues) => {
    const result = setResults.shift();
    if (result) await result;
    Object.assign(values, items);
  });

  vi.stubGlobal('chrome', {
    storage: {
      local: { get, set },
      onChanged: {
        addListener: vi.fn((listener) => listeners.push(listener)),
      },
    },
  } as unknown as typeof chrome);

  return {
    emitChange: (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: chrome.storage.AreaName = 'local',
    ) => {
      if (areaName === 'local') applyChanges(values, changes);
      for (const listener of listeners) listener(changes, areaName);
    },
    get,
    queueGet: (result: Promise<StorageValues> | StorageValues) => {
      getResults.push(result);
    },
    queueSet: (result: Promise<void>) => {
      setResults.push(result);
    },
    set,
    values,
  };
}

/**
 * Selects the requested values using the forms accepted by the Chrome storage API.
 */
function selectValues(values: StorageValues, keys: StorageKeys) {
  if (keys == null) return { ...values };
  if (typeof keys === 'string') return pickValues(values, [keys]);
  if (Array.isArray(keys)) return pickValues(values, keys);

  const result = { ...keys };
  for (const key of Object.keys(keys)) {
    if (key in values) result[key] = values[key];
  }
  return result;
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
