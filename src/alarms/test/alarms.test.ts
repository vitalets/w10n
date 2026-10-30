/**
 * Verifies alarm creation, startup listeners, and observable initialization failures.
 */
import { afterEach, expect, expectTypeOf, test, vi } from 'vitest';
import { ensureAlarm, setupAlarm } from '../index';

afterEach(() => vi.unstubAllGlobals());

test('creates a missing alarm with the supplied parameters', async () => {
  const alarms = installAlarms();

  await expect(ensureAlarm('foo', { when: 1000, periodInMinutes: 5 })).resolves.toBeUndefined();

  expect(alarms.get).toHaveBeenCalledWith('foo');
  expect(alarms.create).toHaveBeenCalledExactlyOnceWith('foo', {
    when: 1000,
    periodInMinutes: 5,
  });
});

test('preserves an existing schedule and parameters', async () => {
  const alarms = installAlarms();
  alarms.get.mockResolvedValue({
    name: 'foo',
    scheduledTime: 1000,
    periodInMinutes: 5,
    persistAcrossSessions: true,
  });

  await ensureAlarm('foo', { when: 2000, periodInMinutes: 10 });

  expect(alarms.create).not.toHaveBeenCalled();
});

test('registers before lookup starts and receives events while lookup is pending', async () => {
  const alarms = installAlarms();
  const lookup = deferred<chrome.alarms.Alarm | undefined>();
  const received: chrome.alarms.Alarm[] = [];
  alarms.get.mockImplementation(() => {
    alarms.emit({ name: 'foo', scheduledTime: 1000, persistAcrossSessions: true });
    return lookup.promise;
  });

  const result = setupAlarm('foo', { delayInMinutes: 1 }, (alarm) => received.push(alarm));

  expect(received).toEqual([{ name: 'foo', scheduledTime: 1000, persistAcrossSessions: true }]);
  expect(alarms.create).not.toHaveBeenCalled();
  lookup.resolve(undefined);
  await expect(result).resolves.toBeUndefined();
  expect(alarms.create).toHaveBeenCalledExactlyOnceWith('foo', { delayInMinutes: 1 });
});

test('delivers only matching events with the original alarm', async () => {
  const alarms = installAlarms();
  const received: chrome.alarms.Alarm[] = [];
  await setupAlarm('foo', { periodInMinutes: 1 }, (alarm) => received.push(alarm));
  const matchingAlarm = { name: 'foo', scheduledTime: 1000, persistAcrossSessions: true };

  alarms.emit({ name: 'bar', scheduledTime: 2000, persistAcrossSessions: true });
  alarms.emit(matchingAlarm);

  expect(received).toHaveLength(1);
  expect(received[0]).toBe(matchingAlarm);
});

test('allows registration without a callback', async () => {
  const alarms = installAlarms();

  await setupAlarm('foo', { periodInMinutes: 1 });

  expect(() => {
    alarms.emit({ name: 'foo', scheduledTime: 1000, persistAcrossSessions: true });
  }).not.toThrow();
});

test('repeated setup registers additional listeners', async () => {
  const alarms = installAlarms();
  const received: string[] = [];
  await setupAlarm('foo', { periodInMinutes: 1 }, () => received.push('bar'));
  await setupAlarm('foo', { periodInMinutes: 1 }, () => received.push('baz'));

  alarms.emit({ name: 'foo', scheduledTime: 1000, persistAcrossSessions: true });

  expect(received).toEqual(['bar', 'baz']);
});

test('waits for creation to complete', async () => {
  const alarms = installAlarms();
  const creation = deferred<void>();
  alarms.create.mockReturnValue(creation.promise);
  let completed = false;

  const result = ensureAlarm('foo', { periodInMinutes: 1 }).then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(alarms.create).toHaveBeenCalledOnce();
  expect(completed).toBe(false);
  creation.resolve();
  await result;
  expect(completed).toBe(true);
});

test('ensure rejects lookup failures without creating an alarm', async () => {
  const alarms = installAlarms();
  alarms.get.mockRejectedValue(new Error('Lookup failed'));

  await expect(ensureAlarm('foo', { periodInMinutes: 1 })).rejects.toThrow(/Lookup/);

  expect(alarms.create).not.toHaveBeenCalled();
});

test('ensure rejects creation failures', async () => {
  const alarms = installAlarms();
  alarms.create.mockRejectedValue(new Error('Creation failed'));

  await expect(ensureAlarm('foo', { periodInMinutes: 1 })).rejects.toThrow(/Creation/);
});

test('setup rejects lookup failures and keeps the listener registered', async () => {
  const alarms = installAlarms();
  alarms.get.mockRejectedValue(new Error('Lookup failed'));
  const received: string[] = [];

  await expect(
    setupAlarm('foo', { periodInMinutes: 1 }, (alarm) => received.push(alarm.name)),
  ).rejects.toThrow(/Lookup/);
  alarms.emit({ name: 'foo', scheduledTime: 1000, persistAcrossSessions: true });

  expect(alarms.create).not.toHaveBeenCalled();
  expect(received).toEqual(['foo']);
});

test('setup rejects creation failures', async () => {
  const alarms = installAlarms();
  alarms.create.mockRejectedValue(new Error('Creation failed'));

  await expect(setupAlarm('foo', { periodInMinutes: 1 })).rejects.toThrow(/Creation/);
});

test('callback errors propagate independently of initialization', async () => {
  const alarms = installAlarms();
  const result = setupAlarm('foo', { periodInMinutes: 1 }, () => {
    throw new Error('Callback failed');
  });
  await expect(result).resolves.toBeUndefined();

  expect(() => {
    alarms.emit({ name: 'foo', scheduledTime: 1000, persistAcrossSessions: true });
  }).toThrow(/Callback/);
});

test('exposes typed initialization promises', () => {
  expectTypeOf<ReturnType<typeof setupAlarm>>().toEqualTypeOf<Promise<void>>();
  expectTypeOf<ReturnType<typeof ensureAlarm>>().toEqualTypeOf<Promise<void>>();
});

/**
 * Installs controllable native alarm operations and event delivery.
 */
function installAlarms() {
  const listeners: ((alarm: chrome.alarms.Alarm) => void)[] = [];
  const alarms = {
    get: vi
      .fn<(name: string) => Promise<chrome.alarms.Alarm | undefined>>()
      .mockResolvedValue(undefined),
    create: vi
      .fn<(name: string, params: chrome.alarms.AlarmCreateInfo) => Promise<void>>()
      .mockResolvedValue(undefined),
    onAlarm: {
      addListener: (listener: (alarm: chrome.alarms.Alarm) => void) => listeners.push(listener),
    },
    emit: (alarm: chrome.alarms.Alarm) => listeners.forEach((listener) => listener(alarm)),
  };
  vi.stubGlobal('chrome', { alarms });
  return alarms;
}

/**
 * Allows a test to finish an asynchronous browser operation explicitly.
 */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
