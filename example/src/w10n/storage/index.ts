/**
 * Provides key-bound WebExtension storage items with serialized transformations.
 */

/**
 * Describes a native storage change for one typed item.
 */
export interface StorageItemChange<T> {
  newValue?: T;
  oldValue?: T;
}

/**
 * Computes the next stored value, or skips the write by returning undefined.
 */
export type StorageItemUpdater<T> = (currentValue: T) => T | undefined;

/**
 * Manages one key in a WebExtension storage area.
 */
export interface StorageItem<T> {
  /**
   * Reads the latest value after earlier queued operations finish.
   */
  get(): Promise<T>;

  /**
   * Serializes a read-transform-write operation and resolves with its resulting value.
   */
  set(updater: StorageItemUpdater<T>): Promise<T>;

  /**
   * Removes the stored value after earlier queued operations finish.
   */
  remove(): Promise<void>;

  /**
   * Subscribes to native changes for this item's key.
   */
  onChange(listener: (change: StorageItemChange<T>) => void): () => void;
}

type WritableStorageAreaName = 'local' | 'session' | 'sync';
type AsyncTask<T> = () => T | PromiseLike<T>;

/**
 * Binds queued storage operations to one key and a snapshot of its fallback value.
 * Must be initialized before the public namespaces create their item subclasses.
 */
class StorageItemImplementation<T> implements StorageItem<T> {
  private readonly defaultValue: T;
  private readonly enqueue = createAsyncQueue();

  constructor(
    private readonly areaName: WritableStorageAreaName,
    private readonly key: string,
    defaultValue: T,
  ) {
    this.defaultValue = structuredClone(defaultValue);
  }

  /**
   * Reads the latest value after earlier queued operations finish.
   */
  get() {
    return this.enqueue(() => this.readValue());
  }

  /**
   * Serializes a read-transform-write operation and resolves with its resulting value.
   */
  set(updater: StorageItemUpdater<T>) {
    return this.enqueue(async () => {
      const currentValue = await this.readValue();
      const nextValue = updater(currentValue);
      if (nextValue === undefined) return currentValue;

      await this.getStorageArea().set({ [this.key]: nextValue });
      return nextValue;
    });
  }

  /**
   * Removes the stored value after earlier queued operations finish.
   */
  remove() {
    return this.enqueue(() => this.getStorageArea().remove(this.key));
  }

  /**
   * Subscribes to native changes for this item's key.
   */
  onChange(listener: (change: StorageItemChange<T>) => void) {
    const storageArea = this.getStorageArea();

    /**
     * Forwards native changes that belong to this item.
     */
    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      const change = changes[this.key];
      if (change) listener(change as StorageItemChange<T>);
    };

    storageArea.onChanged.addListener(handleStorageChange);

    /**
     * Stops forwarding native changes to this listener.
     */
    return () => storageArea.onChanged.removeListener(handleStorageChange);
  }

  /**
   * Reads the persisted value or returns a fresh clone of the fallback.
   */
  private async readValue() {
    const values = await this.getStorageArea().get(this.key);
    return this.key in values ? (values[this.key] as T) : structuredClone(this.defaultValue);
  }

  /**
   * Resolves the native storage area selected by this item's namespace.
   */
  private getStorageArea() {
    return chrome.storage[this.areaName];
  }
}

/**
 * Exposes item constructors under native-style writable storage-area namespaces.
 */
export const storage = {
  local: createStorageAreaNamespace('local'),
  session: createStorageAreaNamespace('session'),
  sync: createStorageAreaNamespace('sync'),
};

/**
 * Creates a namespace containing an item constructor bound to one storage area.
 */
function createStorageAreaNamespace(areaName: WritableStorageAreaName) {
  return {
    Item: class<T> extends StorageItemImplementation<T> {
      /**
       * Binds a storage item to a key and fallback in the namespace's area.
       */
      constructor(key: string, defaultValue: T) {
        super(areaName, key, defaultValue);
      }
    },
  };
}

/**
 * Creates a FIFO queue whose failures do not block later tasks.
 */
function createAsyncQueue() {
  let tail = Promise.resolve();

  /**
   * Runs a task after every task already in the queue has settled.
   */
  return function enqueue<T>(task: AsyncTask<T>) {
    const result = tail.then(task, task);
    tail = result.then(ignoreResult, ignoreResult);
    return result;
  };
}

/**
 * Converts any queue task outcome into a fulfilled tail.
 */
function ignoreResult() {}
