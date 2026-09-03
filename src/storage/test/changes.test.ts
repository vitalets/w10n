/**
 * Verifies native storage-item change subscriptions.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { storage } from '../index';
import { cleanupStorage, installChromeStorage } from './helpers';

afterEach(cleanupStorage);

test('subscribers receive native changes for their key only', () => {
  const chromeStorage = installChromeStorage();
  const item = new storage.sync.Item('groups', [] as string[]);
  const listener = vi.fn();

  item.onChange(listener);
  chromeStorage.sync.emitChange({ other: { newValue: ['ignored'] } });
  chromeStorage.local.emitChange({ groups: { newValue: ['ignored'] } });
  chromeStorage.sync.emitChange({ groups: { oldValue: ['first'], newValue: ['second'] } });

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledWith({ oldValue: ['first'], newValue: ['second'] });
});

test('subscriptions do not emit an initial value', () => {
  installChromeStorage({ local: { counter: 1 } });
  const item = new storage.local.Item('counter', 0);
  const listener = vi.fn();

  item.onChange(listener);

  expect(listener).not.toHaveBeenCalled();
});

test('unsubscribing stops change delivery', () => {
  const chromeStorage = installChromeStorage();
  const item = new storage.local.Item('counter', 0);
  const listener = vi.fn();

  const unsubscribe = item.onChange(listener);
  unsubscribe();
  chromeStorage.local.emitChange({ counter: { newValue: 1 } });

  expect(listener).not.toHaveBeenCalled();
});

test('removal changes do not substitute the default', () => {
  const chromeStorage = installChromeStorage({ local: { counter: 1 } });
  const item = new storage.local.Item('counter', 0);
  const listener = vi.fn();

  item.onChange(listener);
  chromeStorage.local.emitChange({ counter: { oldValue: 1 } });

  expect(listener).toHaveBeenCalledWith({ oldValue: 1 });
});
