/**
 * Verifies exception limits and browser capture.
 */
import { expect, test, vi } from 'vitest';
import { client, payload, emit, requests, failures, fetchMock } from './helpers';

test('failed reports count toward deduplication and the lifetime cap', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
  const analytics = client();
  for (let i = 0; i < 10; i++) await analytics.sendException(`value ${i}`);
  expect(await analytics.sendException('value 0')).toBe(false);
  expect(await analytics.sendException('value 10')).toBe(false);
  expect(requests).toHaveLength(10);
});

test('fallback descriptions retain normal deduplication and report limits', async () => {
  const analytics = client({
    preprocessExceptionMessage: () => {
      throw new Error();
    },
  });
  for (let i = 0; i < 10; i++) expect(await analytics.sendException(`value ${i}`)).toBe(true);
  expect(await analytics.sendException('value 0')).toBe(false);
  expect(await analytics.sendException('value 10')).toBe(false);
  expect(requests).toHaveLength(10);
  expect(failures).toHaveLength(12);
  expect(failures.every((failure) => failure.category === 'preprocessing')).toBe(true);
});

test('captured reporting failures do not create unhandled rejections', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
  const analytics = client({
    onError: async () => {
      throw new Error();
    },
  });
  analytics.captureExceptions();
  emit('unhandledrejection', { reason: 'example' });
  await vi.runAllTimersAsync();
  expect(requests).toHaveLength(1);
  expect(payload().error_kind).toBe('unhandled_rejection');
});

test('capture preserves browser reporting and preprocesses every exception kind', async () => {
  const analytics = client({ preprocessExceptionMessage: (message) => message.toUpperCase() });
  analytics.captureExceptions();
  const error = emit('error', { message: 'example' });
  emit('unhandledrejection', { reason: 'example' });
  await analytics.sendException('example');
  await vi.advanceTimersByTimeAsync(0);
  expect(error.defaultPrevented).toBe(false);
  expect(requests.map((_, i) => payload(i).error_kind).sort()).toEqual([
    'caught_error',
    'uncaught_error',
    'unhandled_rejection',
  ]);
  expect(requests.every((_, i) => payload(i).description === 'EXAMPLE')).toBe(true);
});

test('capture shares the lifetime limit with manual reports', async () => {
  const analytics = client();
  analytics.captureExceptions();
  emit('error', { message: 'example' });
  emit('unhandledrejection', { reason: 'example' });
  await analytics.sendException('example');
  for (let i = 0; i < 7; i++) await analytics.sendException(`value ${i}`);
  emit('error', { message: 'another' });
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toHaveLength(10);
});

test('capture ignores errors without a reason or message', async () => {
  client().captureExceptions();
  emit('error', {});
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toEqual([]);
});

test('capture cleanup is idempotent and does not disable manual reporting', async () => {
  const analytics = client();
  const stop = analytics.captureExceptions();
  expect(analytics.captureExceptions()).toBe(stop);
  emit('error', { message: 'first' });
  await vi.advanceTimersByTimeAsync(0);
  stop();
  stop();
  emit('error', { message: 'second' });
  expect(await analytics.sendException('manual')).toBe(true);
  expect(requests.map((_, i) => payload(i).description)).toEqual(['first', 'manual']);
});

test('old cleanup leaves later capture active with existing deduplication', async () => {
  const analytics = client();
  const stop = analytics.captureExceptions();
  emit('error', { message: 'first' });
  await vi.advanceTimersByTimeAsync(0);
  stop();
  const stopAgain = analytics.captureExceptions();
  stop();
  emit('error', { message: 'first' });
  emit('error', { message: 'second' });
  await vi.advanceTimersByTimeAsync(0);
  expect(requests.map((_, i) => payload(i).description)).toEqual(['first', 'second']);
  stopAgain();
});
