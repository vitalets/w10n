/**
 * Verifies ignoreErrors broad and message-selective error suppression.
 */
import { expect, test } from 'vitest';
import { ignoreErrors } from '../index';

test('synchronous results pass through', async () => {
  await expect(ignoreErrors(() => 'value')).resolves.toBe('value');
});

test('asynchronous results pass through', async () => {
  await expect(ignoreErrors(() => Promise.resolve('value'))).resolves.toBe('value');
});

test('an omitted message list suppresses every failure', async () => {
  await expect(
    ignoreErrors(() => {
      throw new Error('failure');
    }),
  ).resolves.toBeUndefined();
  await expect(ignoreErrors(() => Promise.reject('failure'))).resolves.toBeUndefined();
  await expect(ignoreErrors(() => Promise.reject(null))).resolves.toBeUndefined();
});

test('an undefined message list suppresses every failure', async () => {
  await expect(ignoreErrors(() => Promise.reject('failure'), undefined)).resolves.toBeUndefined();
});

test('an empty message list suppresses no failures', async () => {
  const error = new Error('failure');

  await expect(ignoreErrors(() => Promise.reject(error), [])).rejects.toBe(error);
});

test('selected object and string messages are suppressed', async () => {
  await expect(
    ignoreErrors(() => Promise.reject(new Error('ignored')), ['ignored']),
  ).resolves.toBeUndefined();
  await expect(ignoreErrors(() => Promise.reject('ignored'), ['ignored'])).resolves.toBeUndefined();
});

test('message matching is exact and case-sensitive', async () => {
  const differentlyCasedError = new Error('Ignored');
  const extendedError = new Error('ignored detail');

  await expect(ignoreErrors(() => Promise.reject(differentlyCasedError), ['ignored'])).rejects.toBe(
    differentlyCasedError,
  );
  await expect(ignoreErrors(() => Promise.reject(extendedError), ['ignored'])).rejects.toBe(
    extendedError,
  );
});

test('unselected failures preserve their identity', async () => {
  const error = { message: 'failure' };

  await expect(ignoreErrors(() => Promise.reject(error), ['ignored'])).rejects.toBe(error);
});

test('message inspection failures do not replace the original error', async () => {
  const error = Object.defineProperty({}, 'message', {
    get() {
      throw new Error('inspection failed');
    },
  });

  await expect(ignoreErrors(() => Promise.reject(error), ['ignored'])).rejects.toBe(error);
});
