/**
 * Verifies delivery retries and preparation failures.
 */
import { expect, test, vi } from 'vitest';
import { client, requests, failures, fetchMock, getStorage, setStorage } from './helpers';

test('retries network failures with the original metadata and payload', async () => {
  fetchMock
    .mockRejectedValueOnce(new Error('private request'))
    .mockRejectedValueOnce(new Error('private request'))
    .mockRejectedValueOnce(new Error('private request'));
  const result = client().sendEvent('opened');
  await vi.advanceTimersByTimeAsync(0);
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', new URL('chrome-extension://example/other'));
  await vi.runAllTimersAsync();
  expect(await result).toBe(true);
  expect(requests).toHaveLength(4);
  expect(new Set(requests.map((request) => request.body)).size).toBe(1);
  expect(setStorage).toHaveBeenCalledTimes(1);
  expect(failures).toEqual([]);
});

test('spaces network retries by one, two, and three seconds', async () => {
  fetchMock.mockRejectedValue(new Error('network failure'));
  const result = client().sendEvent('opened');
  for (const [elapsed, count] of [
    [999, 1],
    [1, 2],
    [1999, 2],
    [1, 3],
    [2999, 3],
    [1, 4],
  ]) {
    await vi.advanceTimersByTimeAsync(elapsed);
    expect(requests).toHaveLength(count);
  }
  expect(await result).toBe(false);
});

test.each([400, 429, 500, 503])('does not retry HTTP %s even with Retry-After', async (status) => {
  fetchMock.mockResolvedValue(new Response(null, { status, headers: { 'Retry-After': '30' } }));
  expect(await client().sendEvent('opened')).toBe(false);
  expect(requests).toHaveLength(1);
  expect(failures).toEqual([{ category: 'http', status, attempts: 1 }]);
});

test('reports final network failure without exposing request details', async () => {
  fetchMock.mockRejectedValue(new Error('secret payload and request URL'));
  const result = client().sendEvent('opened');
  await vi.runAllTimersAsync();
  expect(await result).toBe(false);
  expect(failures).toEqual([{ category: 'network', attempts: 4 }]);
});

test('aborts each timed out request and stops after three retries', async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const result = client().sendEvent('opened');
  await vi.runAllTimersAsync();
  expect(await result).toBe(false);
  expect(requests).toHaveLength(4);
  expect(requests.every((request) => request.signal.aborted)).toBe(true);
  expect(failures).toEqual([{ category: 'timeout', attempts: 4 }]);
});

test.each([0, 1, 4])('limits network retries to %s', async (retries) => {
  fetchMock.mockRejectedValue(new Error('network failure'));
  const result = client({ retries }).sendEvent('opened');
  await vi.runAllTimersAsync();
  expect(await result).toBe(false);
  expect(requests).toHaveLength(retries + 1);
  expect(failures).toEqual([{ category: 'network', attempts: retries + 1 }]);
});

test('disables timeout retries when retries is zero', async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const result = client({ retries: 0 }).sendException('example');
  await vi.runAllTimersAsync();
  expect(await result).toBe(false);
  expect(requests).toHaveLength(1);
  expect(requests[0].signal.aborted).toBe(true);
  expect(failures).toEqual([{ category: 'timeout', attempts: 1 }]);
});

test.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid retries %s during creation',
  (retries) => {
    expect(() => client({ retries })).toThrow('retries');
    expect(requests).toEqual([]);
  },
);

test('storage failure does not poison later sends', async () => {
  getStorage.mockRejectedValueOnce(new Error('private storage data'));
  const analytics = client();
  expect(await analytics.sendEvent('opened')).toBe(false);
  expect(await analytics.sendEvent('opened')).toBe(true);
  expect(failures).toEqual([{ category: 'storage', attempts: 0 }]);
});

test('serialization failures resolve false', async () => {
  const params = {
    get value(): string {
      throw new Error('private value');
    },
  };
  expect(await client().sendEvent('changed', params)).toBe(false);
  expect(requests).toEqual([]);
  expect(failures).toEqual([{ category: 'serialization', attempts: 0 }]);
});

test.each([false, true])('contains error callback failures (async: %s)', async (asyncFailure) => {
  fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
  const onError = () => {
    if (asyncFailure) return Promise.reject(new Error('callback failure'));
    throw new Error('callback failure');
  };
  expect(await client({ onError }).sendEvent('opened')).toBe(false);
});
