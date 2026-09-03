/**
 * Verifies storage-item values, defaults, removal, and namespace routing.
 */
import { afterEach, expect, test } from 'vitest';
import { storage } from '../index';
import { cleanupStorage, installChromeStorage } from './helpers';

afterEach(cleanupStorage);

test('missing values use a fresh clone of the default', async () => {
  installChromeStorage();
  const configuredDefault = { names: ['first'] };
  const item = new storage.local.Item('groups', configuredDefault);

  configuredDefault.names.push('outside');
  const firstValue = await item.get();
  firstValue.names.push('inside');

  await expect(item.get()).resolves.toEqual({ names: ['first'] });
});

test('default values are not persisted until returned by an updater', async () => {
  const chromeStorage = installChromeStorage();
  const item = new storage.local.Item('settings', { enabled: false });

  await expect(item.get()).resolves.toEqual({ enabled: false });
  expect(chromeStorage.local.values).toEqual({});

  await expect(item.set(() => ({ enabled: false }))).resolves.toEqual({ enabled: false });
  expect(chromeStorage.local.values).toEqual({ settings: { enabled: false } });
});

test('undefined updater results leave storage unchanged', async () => {
  const chromeStorage = installChromeStorage({ local: { counter: 2 } });
  const item = new storage.local.Item('counter', 0);

  await expect(item.set(() => undefined)).resolves.toBe(2);

  expect(chromeStorage.local.values).toEqual({ counter: 2 });
  expect(chromeStorage.local.set).not.toHaveBeenCalled();
});

test('null is stored as a value', async () => {
  const chromeStorage = installChromeStorage();
  const item = new storage.local.Item<string | null>('selection', 'default');

  await expect(item.set(() => null)).resolves.toBeNull();

  expect(chromeStorage.local.values).toEqual({ selection: null });
  await expect(item.get()).resolves.toBeNull();
});

test('removed values fall back to the default', async () => {
  const chromeStorage = installChromeStorage({ sync: { groups: ['first'] } });
  const item = new storage.sync.Item('groups', [] as string[]);

  await item.remove();

  expect(chromeStorage.sync.values).toEqual({});
  await expect(item.get()).resolves.toEqual([]);
});

test('namespaces write to their native storage areas', async () => {
  const chromeStorage = installChromeStorage();
  const localItem = new storage.local.Item('value', 0);
  const sessionItem = new storage.session.Item('value', 0);
  const syncItem = new storage.sync.Item('value', 0);

  await Promise.all([localItem.set(() => 1), sessionItem.set(() => 2), syncItem.set(() => 3)]);

  expect(chromeStorage.local.values).toEqual({ value: 1 });
  expect(chromeStorage.session.values).toEqual({ value: 2 });
  expect(chromeStorage.sync.values).toEqual({ value: 3 });
});
