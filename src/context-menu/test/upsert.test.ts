/**
 * Verifies stable-ID context-menu registration and completion behavior.
 */
import { afterEach, expect, expectTypeOf, test } from 'vitest';
import { upsertContextMenu } from '../index';
import { cleanupContextMenus, installChromeContextMenus } from './helpers';

afterEach(cleanupContextMenus);

test('keeps identifiers and click handlers outside properties', () => {
  type Properties = Parameters<typeof upsertContextMenu>[1];
  type HasId = 'id' extends keyof Properties ? true : false;
  type HasOnClick = 'onclick' extends keyof Properties ? true : false;

  expectTypeOf<HasId>().toEqualTypeOf<false>();
  expectTypeOf<HasOnClick>().toEqualTypeOf<false>();
});

test('creates an absent item', async () => {
  const contextMenus = installChromeContextMenus();

  const result = upsertContextMenu('open-dashboard', {
    title: 'Open dashboard',
    contexts: ['action'],
  });
  await contextMenus.createRequested;
  contextMenus.completeCreate();

  await expect(result).resolves.toBeUndefined();
  expect(contextMenus.items.get('open-dashboard')).toEqual({
    id: 'open-dashboard',
    title: 'Open dashboard',
    contexts: ['action'],
  });
});

test('updates an existing item as a patch', async () => {
  const contextMenus = installChromeContextMenus([
    {
      id: 'open-dashboard',
      title: 'Old title',
      contexts: ['action'],
      visible: false,
    },
  ]);

  await upsertContextMenu('open-dashboard', { title: 'New title', visible: true });

  expect(contextMenus.items.get('open-dashboard')).toEqual({
    id: 'open-dashboard',
    title: 'New title',
    contexts: ['action'],
    visible: true,
  });
  expect(contextMenus.create).not.toHaveBeenCalled();
});

test('tries creation after any update failure', async () => {
  const contextMenus = installChromeContextMenus();
  contextMenus.queueUpdateFailure(new Error('Update unavailable'));

  const result = upsertContextMenu('open-dashboard', { title: 'Open dashboard' });
  await contextMenus.createRequested;
  contextMenus.completeCreate();

  await expect(result).resolves.toBeUndefined();
  expect(contextMenus.items.get('open-dashboard')).toEqual({
    id: 'open-dashboard',
    title: 'Open dashboard',
  });
});

test('waits for creation to finish', async () => {
  const contextMenus = installChromeContextMenus();
  let settled = false;

  const result = upsertContextMenu('open-dashboard', { title: 'Open dashboard' }).finally(() => {
    settled = true;
  });
  await contextMenus.createRequested;
  await Promise.resolve();

  expect(settled).toBe(false);
  contextMenus.completeCreate();
  await result;
  expect(settled).toBe(true);
});

test('rejects callback-reported creation failures', async () => {
  const contextMenus = installChromeContextMenus();

  const result = upsertContextMenu('open-dashboard', { title: 'Open dashboard' });
  await contextMenus.createRequested;
  contextMenus.completeCreate(new Error('Creation denied'));

  await expect(result).rejects.toThrow('Creation denied');
  expect(contextMenus.items.has('open-dashboard')).toBe(false);
});

test('sequential registrations leave one current item', async () => {
  const contextMenus = installChromeContextMenus();

  const firstRegistration = upsertContextMenu('open-dashboard', {
    title: 'Old title',
    contexts: ['action'],
  });
  await contextMenus.createRequested;
  contextMenus.completeCreate();
  await firstRegistration;

  await upsertContextMenu('open-dashboard', { title: 'New title' });

  expect([...contextMenus.items.values()]).toEqual([
    {
      id: 'open-dashboard',
      title: 'New title',
      contexts: ['action'],
    },
  ]);
});
