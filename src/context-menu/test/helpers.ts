/**
 * Provides a controllable in-memory Chrome context-menu implementation for tests.
 */
import { vi } from 'vitest';

type ContextMenuItem = chrome.contextMenus.CreateProperties & { id: string };

interface PendingCreate {
  callback: () => void;
  item: ContextMenuItem;
}

/**
 * Installs stateful Chrome context menus with callback-controlled creation.
 */
export function installChromeContextMenus(initialItems: ContextMenuItem[] = []) {
  const menus = new ContextMenus(initialItems);
  vi.stubGlobal('chrome', {
    contextMenus: { create: menus.create, update: menus.update },
    runtime: menus.runtime,
  } as unknown as typeof chrome);
  return menus;
}

/**
 * Restores globals and spies changed by context-menu tests.
 */
export function cleanupContextMenus() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

/**
 * Tracks native menu items and pending callback-based creation.
 */
class ContextMenus {
  readonly items: Map<string, ContextMenuItem>;
  readonly runtime: { lastError?: chrome.runtime.LastError } = {};
  private updateFailures: unknown[] = [];
  private pendingCreates: PendingCreate[] = [];
  private notifyCreateRequested!: () => void;
  readonly createRequested = new Promise<void>((resolve) => {
    this.notifyCreateRequested = resolve;
  });

  constructor(initialItems: ContextMenuItem[]) {
    this.items = new Map(initialItems.map((item) => [item.id, { ...item }]));
  }

  /**
   * Updates an existing menu item or surfaces the next controlled failure.
   */
  update = vi.fn(
    async (id: string | number, properties: Parameters<typeof chrome.contextMenus.update>[1]) => {
      const updateFailure = this.updateFailures.shift();
      if (updateFailure !== undefined) throw updateFailure;
      const item = this.items.get(String(id));
      if (!item) throw new Error(`Cannot find menu item with id ${String(id)}`);
      Object.assign(item, properties);
    },
  );

  /**
   * Queues a native menu creation until the test completes it.
   */
  create = vi.fn((properties: chrome.contextMenus.CreateProperties, callback = () => {}) => {
    const id = properties.id ?? String(this.items.size + this.pendingCreates.length);
    this.pendingCreates.push({ callback, item: { ...properties, id } });
    this.notifyCreateRequested();
    return id;
  });

  /**
   * Completes the oldest menu creation with native duplicate-ID behavior.
   */
  completeCreate(error?: Error) {
    const pendingCreate = this.pendingCreates.shift();
    if (!pendingCreate) throw new Error('No context-menu creation is pending');
    const createError = error ?? getDuplicateIdError(this.items, pendingCreate.item.id);
    if (createError) this.runtime.lastError = { message: createError.message };
    else this.items.set(pendingCreate.item.id, pendingCreate.item);
    pendingCreate.callback();
    delete this.runtime.lastError;
  }

  /**
   * Controls the next menu update failure.
   */
  queueUpdateFailure(error: unknown) {
    this.updateFailures.push(error);
  }
}

/**
 * Reports when creating an item would reuse an existing stable ID.
 */
function getDuplicateIdError(items: Map<string, ContextMenuItem>, id: string) {
  return items.has(id) ? new Error(`Cannot create item with duplicate id ${id}`) : undefined;
}
