/**
 * Verifies release selection, ordered execution, and migration failure semantics.
 */
import { expect, test } from 'vitest';
import { runMigrations, type Migration } from '../index';

test('runs every crossed release in numeric order', async () => {
  const effects: string[] = [];
  const migrations = [
    step('2.10', '2.10', effects),
    step('2.9.0.1', '2.9.0.1', effects),
    step('2.9', '2.9', effects),
    step('2.8', '2.8', effects),
    step('3', '3', effects),
  ];
  await runMigrations(migrations, { previousVersion: '2.8', currentVersion: '2.10' });
  expect(effects).toEqual(['2.9', '2.9.0.1', '2.10']);
});

test('keeps registration order for equivalent targets', async () => {
  const effects: string[] = [];
  const migrations = Object.freeze([
    step('2.0.0.0', 'first', effects),
    step('2', 'second', effects),
    step('1.5', 'third', effects),
  ]);
  const original = [...migrations];
  await runMigrations(migrations, { previousVersion: '1', currentVersion: '2.0' });
  expect(effects).toEqual(['third', 'first', 'second']);
  // Sorting leaves the caller's frozen registry unchanged.
  expect(migrations).toEqual(original);
});

test('excludes targets equivalent to the previous release', async () => {
  const effects: string[] = [];
  await runMigrations([step('2.0.0.0', 'first', effects)], {
    previousVersion: '2',
    currentVersion: '3',
  });
  expect(effects).toEqual([]);
});

test('waits for each step', async () => {
  const effects: string[] = [];
  const pending = deferred();
  let completed = false;
  const result = runMigrations(
    [
      {
        version: '2',
        async run() {
          effects.push('first');
          await pending.promise;
        },
      },
      step('3', 'second', effects),
    ],
    { previousVersion: '1', currentVersion: '3' },
  ).then(() => {
    completed = true;
  });
  await Promise.resolve();
  expect(effects).toEqual(['first']);
  expect(completed).toBe(false);
  pending.resolve();
  await result;
  expect(effects).toEqual(['first', 'second']);
  expect(completed).toBe(true);
});

test('stops after rejection', async () => {
  const effects: string[] = [];
  const failure = new Error('Failed step');
  await expect(
    runMigrations(
      [
        step('2', 'first', effects),
        {
          version: '3',
          async run() {
            throw failure;
          },
        },
        step('4', 'second', effects),
      ],
      { previousVersion: '1', currentVersion: '4' },
    ),
  ).rejects.toBe(failure);
  expect(effects).toEqual(['first']);
});

test('repeats selected steps on each call', async () => {
  const effects: string[] = [];
  const migrations: Migration[] = [
    step('2', 'first', effects),
    {
      version: '3',
      async run() {
        throw new Error('Failed step');
      },
    },
  ];
  const versions = { previousVersion: '1', currentVersion: '3' };
  await expect(runMigrations(migrations, versions)).rejects.toThrow(/Failed step/);
  // The caller fixes the failed step and retries the same release range.
  migrations[1] = step('3', 'second', effects);
  await runMigrations(migrations, versions);
  // A successful call does not checkpoint subsequent calls either.
  await runMigrations(migrations, versions);
  expect(effects).toEqual(['first', 'first', 'second', 'first', 'second']);
});

test.each(['2.0', '1'])('runs nothing when current release is %s', async (currentVersion) => {
  const effects: string[] = [];
  await runMigrations([step('2', 'first', effects)], { previousVersion: '2', currentVersion });
  expect(effects).toEqual([]);
});

test('accepts an empty registry and maximum version components', async () => {
  await expect(
    runMigrations([], { previousVersion: '0.0.0.1', currentVersion: '65535.65535.65535.65535' }),
  ).resolves.toBeUndefined();
});

test.each([
  '',
  '0',
  '0.0.0.0',
  '01',
  '1.00',
  '65536',
  '1.2.3.4.5',
  '1..2',
  '-1',
  '1.5a',
  '1.0-beta',
  '1+build',
  ' 1',
  '1\n',
])('rejects invalid version %j before any effects', async (invalidVersion) => {
  const effects: string[] = [];
  const valid = step('2', 'first', effects);
  await expect(
    runMigrations([valid, step(invalidVersion, 'second', effects)], {
      previousVersion: '1',
      currentVersion: '3',
    }),
  ).rejects.toThrow(/Invalid extension version/);
  await expect(
    runMigrations([valid], { previousVersion: invalidVersion, currentVersion: '3' }),
  ).rejects.toThrow(/Invalid extension version/);
  await expect(
    runMigrations([valid], { previousVersion: '1', currentVersion: invalidVersion }),
  ).rejects.toThrow(/Invalid extension version/);
  expect(effects).toEqual([]);
});

test.each(['2', '1'])(
  'validates registered versions even when current release is %s',
  async (currentVersion) => {
    await expect(
      runMigrations([step('foo', 'first', [])], { previousVersion: '2', currentVersion }),
    ).rejects.toThrow(/Invalid extension version.*foo/);
  },
);

test('validates bounds even for an empty registry', async () => {
  await expect(runMigrations([], { previousVersion: 'foo', currentVersion: '2' })).rejects.toThrow(
    /Invalid extension version.*foo/,
  );
});

/**
 * Creates a migration whose completion is observable in the supplied effects.
 */
function step(version: string, value: string, effects: string[]) {
  return {
    version,
    async run() {
      effects.push(value);
    },
  };
}

/**
 * Lets a test explicitly complete a pending asynchronous step.
 */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
