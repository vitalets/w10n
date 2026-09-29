/**
 * Verifies session persistence and serialized activity.
 */
import { expect, test, vi } from 'vitest';
import { client, payload, stored, requests, getStorage, setStorage } from './helpers';

test('reuses sessions across clients and refreshes activity', async () => {
  await client().sendEvent('opened');
  vi.setSystemTime(Date.now() + 1000);
  await client().sendEvent('opened');
  expect(payload(1).session_id).toBe(payload(0).session_id);
  expect(stored.googleAnalyticsSession).toEqual({
    sessionId: '1800000000000',
    timestamp: 1_800_000_001_000,
  });
});

test.each([30 * 60_000, 30 * 60_000 + 1])(
  'expires only after more than thirty idle minutes (%s)',
  async (elapsed) => {
    await client().sendEvent('opened');
    vi.setSystemTime(Date.now() + elapsed);
    await client().sendEvent('opened');
    expect(payload(1).session_id === payload(0).session_id).toBe(elapsed === 30 * 60_000);
  },
);

test.each([
  null,
  {},
  { sessionId: 'invalid', timestamp: 1 },
  { sessionId: '1', timestamp: NaN },
  { sessionId: '1', timestamp: 1_900_000_000_000 },
])('recreates malformed session %j', async (session) => {
  stored.googleAnalyticsSession = session;
  await client().sendEvent('opened');
  expect(stored.googleAnalyticsSession).toEqual({
    sessionId: '1800000000000',
    timestamp: 1_800_000_000_000,
  });
});

test('serializes concurrent session refreshes and honors the storage key', async () => {
  const releaseWrite = holdSessionWrite();
  const analytics = client({ sessionStorageKey: 'customSession' });
  const first = analytics.sendEvent('opened');
  const second = analytics.sendEvent('opened');
  await vi.advanceTimersByTimeAsync(0);
  expect(getStorage).toHaveBeenCalledTimes(1);
  expect(requests).toEqual([]);
  releaseWrite();
  expect(await Promise.all([first, second])).toEqual([true, true]);
  expect(payload(0).session_id).toBe(payload(1).session_id);
  expect(stored.customSession).toBeDefined();
  expect(setStorage).toHaveBeenCalledTimes(2);
});

test('stores session activity only under the configured key', async () => {
  await client({ sessionStorageKey: 'customSession' }).sendEvent('opened');
  expect(stored.customSession).toBeDefined();
  expect(stored.googleAnalyticsSession).toBeUndefined();
});

/**
 * Holds the next session write until the test explicitly releases it.
 */
function holdSessionWrite() {
  let releaseWrite!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  setStorage.mockImplementationOnce(async (values: Record<string, unknown>) => {
    await firstWrite;
    Object.assign(stored, structuredClone(values));
  });
  return releaseWrite;
}
