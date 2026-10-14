/**
 * Verifies Debug submenu registration, command dispatch, and startup failures.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { createDebugContextMenu } from '../index';

afterEach(() => vi.unstubAllGlobals());

test('creates action commands with generated identifiers', async () => {
  const menus = installMenus();
  await createDebugContextMenu([{ title: 'First', run: () => {} }]);
  expect([...menus.items.values()]).toEqual([
    { id: 'other', title: 'Other' },
    { id: 'w10n-debug', title: 'Debug', contexts: ['action'] },
    {
      id: 'w10n-debug-0',
      title: 'First',
      parentId: 'w10n-debug',
      contexts: ['action'],
    },
  ]);
});

test('registers dispatch before asynchronous startup', async () => {
  const menus = installMenus();
  const outcomes: string[] = [];
  const ready = createDebugContextMenu([
    { title: 'Same', run: () => outcomes.push('first') },
    {
      title: 'Same',
      run: async () => {
        outcomes.push('second');
      },
    },
  ]);
  expect(menus.listeners.size).toBe(1);
  await ready;
  menus.click('w10n-debug-1');
  menus.click('other');
  menus.click('w10n-debug');
  menus.click('w10n-debug-0');
  expect(outcomes).toEqual(['second', 'first']);
});

test('replaces stale commands after a worker restart', async () => {
  const menus = installMenus();
  await createDebugContextMenu([
    { title: 'First', run: () => {} },
    { title: 'Second', run: () => {} },
  ]);
  menus.listeners.clear();
  await createDebugContextMenu([{ title: 'Updated', run: () => {} }]);
  expect([...menus.items.values()].map(({ title }) => title)).toEqual([
    'Other',
    'Debug',
    'Updated',
  ]);
});

test('an empty command list removes the previous submenu', async () => {
  const menus = installMenus();
  await createDebugContextMenu([{ title: 'First', run: () => {} }]);
  menus.listeners.clear();
  await createDebugContextMenu([]);
  expect([...menus.items.values()]).toEqual([{ id: 'other', title: 'Other' }]);
});

test('reports registration failures and removes its listener', async () => {
  const menus = installMenus();
  menus.runtime.lastError = { message: 'Creation denied' };
  await expect(createDebugContextMenu([{ title: 'First', run: () => {} }])).rejects.toThrow(
    'Creation denied',
  );
  expect(menus.listeners.size).toBe(0);
});

/**
 * Installs a minimal stateful Chrome menu API that preserves unrelated items.
 */
function installMenus() {
  const items = new Map<string, chrome.contextMenus.CreateProperties>([
    ['other', { id: 'other', title: 'Other' }],
  ]);
  const listeners = new Set<(info: chrome.contextMenus.OnClickData) => void>();
  const runtime: { lastError?: chrome.runtime.LastError } = {};
  vi.stubGlobal('chrome', {
    runtime,
    contextMenus: {
      onClicked: {
        addListener: listeners.add.bind(listeners),
        removeListener: listeners.delete.bind(listeners),
      },
      remove: async (id: string) => removeItem(items, id),
      create: (properties: chrome.contextMenus.CreateProperties, callback: () => void) => {
        if (!runtime.lastError) items.set(properties.id!, properties);
        callback();
        return properties.id;
      },
    },
  });
  return {
    items,
    listeners,
    runtime,
    click: (menuItemId: string) => {
      for (const listener of listeners) listener({ menuItemId, editable: false });
    },
  };
}

/**
 * Removes a parent and its children while preserving unrelated items.
 */
function removeItem(items: Map<string, chrome.contextMenus.CreateProperties>, id: string) {
  if (!items.delete(id)) throw new Error('Missing item');
  for (const [childId, item] of items) {
    if (item.parentId === id) items.delete(childId);
  }
}
