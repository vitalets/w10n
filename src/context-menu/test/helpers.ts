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
  const items = new Map(initialItems.map((item) => [item.id, { ...item }]));
  const updateFailures: unknown[] = [];
  const pendingCreates: PendingCreate[] = [];
  let notifyCreateRequested!: () => void;
  const createRequested = new Promise<void>((resolve) => {
    notifyCreateRequested = resolve;
  });

  const runtime: { lastError?: chrome.runtime.LastError } = {};
  const update = vi.fn(async (id: string | number, properties) => {
    const updateFailure = updateFailures.shift();
    if (updateFailure !== undefined) throw updateFailure;

    const item = items.get(String(id));
    if (!item) throw new Error(`Cannot find menu item with id ${String(id)}`);
    Object.assign(item, properties);
  });
  const create = vi.fn((properties: chrome.contextMenus.CreateProperties, callback = () => {}) => {
    const id = properties.id ?? String(items.size + pendingCreates.length);
    pendingCreates.push({ callback, item: { ...properties, id } });
    notifyCreateRequested();
    return id;
  });

  vi.stubGlobal('chrome', {
    contextMenus: { create, update },
    runtime,
  } as unknown as typeof chrome);

  return {
    completeCreate(error?: Error) {
      const pendingCreate = pendingCreates.shift();
      if (!pendingCreate) throw new Error('No context-menu creation is pending');

      const createError = error ?? getDuplicateIdError(items, pendingCreate.item.id);
      if (createError) runtime.lastError = { message: createError.message };
      else items.set(pendingCreate.item.id, pendingCreate.item);

      pendingCreate.callback();
      delete runtime.lastError;
    },
    create,
    createRequested,
    items,
    queueUpdateFailure(error: unknown) {
      updateFailures.push(error);
    },
    update,
  };
}

/**
 * Restores globals and spies changed by context-menu tests.
 */
export function cleanupContextMenus() {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
}

/**
 * Reports when creating an item would reuse an existing stable ID.
 */
function getDuplicateIdError(items: Map<string, ContextMenuItem>, id: string) {
  return items.has(id) ? new Error(`Cannot create item with duplicate id ${id}`) : undefined;
}
