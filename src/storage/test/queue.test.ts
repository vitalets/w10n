/**
 * Verifies FIFO storage-item operations and failure recovery.
 */
import { afterEach, expect, test } from 'vitest';
import { storage } from '../index';
import { cleanupStorage, createDeferred, installChromeStorage } from './helpers';

afterEach(cleanupStorage);

test('concurrent transformations preserve every update', async () => {
  installChromeStorage({ local: { counter: 0 } });
  const item = new storage.local.Item('counter', 0);

  const firstUpdate = item.set((value) => value + 1);
  const observedBetweenUpdates = item.get();
  const secondUpdate = item.set((value) => value + 1);

  await expect(firstUpdate).resolves.toBe(1);
  await expect(observedBetweenUpdates).resolves.toBe(1);
  await expect(secondUpdate).resolves.toBe(2);
  await expect(item.get()).resolves.toBe(2);
});

test('later operations wait for a pending write', async () => {
  const pendingWrite = createDeferred<void>();
  const chromeStorage = installChromeStorage({ local: { counter: 0 } });
  chromeStorage.local.queueSet(pendingWrite.promise);
  const item = new storage.local.Item('counter', 0);

  const write = item.set((value) => value + 1);
  const read = item.get();
  await Promise.resolve();
  await Promise.resolve();

  expect(chromeStorage.local.get).toHaveBeenCalledTimes(1);
  pendingWrite.resolve();

  await expect(write).resolves.toBe(1);
  await expect(read).resolves.toBe(1);
});

test('a rejected write does not block later operations', async () => {
  const chromeStorage = installChromeStorage({ local: { counter: 0 } });
  chromeStorage.local.queueSet(Promise.reject(new Error('write failed')));
  const item = new storage.local.Item('counter', 0);

  const failedWrite = item.set((value) => value + 1);
  const nextWrite = item.set((value) => value + 1);

  await expect(failedWrite).rejects.toThrow('write failed');
  await expect(nextWrite).resolves.toBe(1);
  await expect(item.get()).resolves.toBe(1);
});

test('a thrown updater does not block later operations', async () => {
  installChromeStorage({ local: { counter: 0 } });
  const item = new storage.local.Item('counter', 0);

  const failedWrite = item.set(() => {
    throw new Error('update failed');
  });
  const nextWrite = item.set((value) => value + 1);

  await expect(failedWrite).rejects.toThrow('update failed');
  await expect(nextWrite).resolves.toBe(1);
});

test('removal stays ordered with writes and reads', async () => {
  installChromeStorage({ local: { counter: 1 } });
  const item = new storage.local.Item('counter', 0);

  const write = item.set((value) => value + 1);
  const removal = item.remove();
  const read = item.get();

  await expect(write).resolves.toBe(2);
  await expect(removal).resolves.toBeUndefined();
  await expect(read).resolves.toBe(0);
});
