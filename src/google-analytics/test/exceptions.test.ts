/**
 * Verifies exception normalization and preprocessing.
 */
import { expect, test } from 'vitest';
import { client, payload, failures, fetchMock } from './helpers';

test('preprocesses messages before truncation and deduplication', async () => {
  const analytics = client({
    preprocessExceptionMessage: (message) => message.replace(/\d{6,}/g, 'XXXXXXXXX'),
  });
  const first = new Error('No tab with id: 882489154.');
  first.stack = `${first.name}: ${first.message}\n    at sameLocation`;
  const second = new Error('No tab with id: 882489155.');
  second.stack = `${second.name}: ${second.message}\n    at sameLocation`;
  expect(await analytics.sendException(first)).toBe(true);
  expect(await analytics.sendException(second)).toBe(false);
  expect(payload()).toMatchObject({
    description: 'Error: No tab with id: XXXXXXXXX.',
    stack: '    at sameLocation',
    fatal: false,
    error_kind: 'caught_error',
  });
});

test('limits descriptions and stacks after preprocessing', async () => {
  const reason = new Error('a'.repeat(150));
  reason.stack = `Error: ${reason.message}\n${'b'.repeat(150)}`;
  await client({ preprocessExceptionMessage: (message) => message + 'c' }).sendException(reason);
  expect(payload().description).toBe(`Error: ${'a'.repeat(150)}c`.slice(0, 100));
  expect(payload().stack).toBe('b'.repeat(100));
});

test.each([undefined, null, 'example', { value: 1 }, 42])(
  'normalizes caught values %j',
  async (value) => {
    expect(await client().sendException(value)).toBe(true);
    expect(typeof payload().description).toBe('string');
  },
);

test('contains circular values and throwing conversions', async () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  expect(await client().sendException(circular)).toBe(true);
  expect(payload().description).toBe('[object Object]');
  const reason = {
    toJSON() {
      throw new Error();
    },
    toString() {
      throw new Error();
    },
  };
  expect(await client().sendException(reason)).toBe(true);
  expect(payload(1).description).toBe('Unknown error');
});

test.each(['throw', 'invalid', 'reject'])(
  'falls back after preprocessing failure: %s',
  async (mode) => {
    const preprocessExceptionMessage = (() => {
      if (mode === 'reject') return Promise.reject(new Error('private preprocessing error'));
      if (mode === 'invalid') return undefined;
      throw new Error('private preprocessing error');
    }) as unknown as (message: string) => string;
    expect(await client({ preprocessExceptionMessage }).sendException('original')).toBe(true);
    expect(payload().description).toBe('original');
    expect(failures).toEqual([{ category: 'preprocessing', attempts: 0 }]);
  },
);

test('notifies separately when preprocessing and fallback sending fail', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
  expect(
    await client({
      preprocessExceptionMessage: () => {
        throw new Error();
      },
    }).sendException('original'),
  ).toBe(false);
  expect(failures).toEqual([
    { category: 'preprocessing', attempts: 0 },
    { category: 'http', attempts: 1, status: 400 },
  ]);
});

test('fallback reporting survives error callback rejection', async () => {
  const analytics = client({
    preprocessExceptionMessage: () => {
      throw new Error();
    },
    onError: async () => {
      throw new Error();
    },
  });
  expect(await analytics.sendException('original')).toBe(true);
  expect(payload().description).toBe('original');
});
