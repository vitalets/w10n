/**
 * Verifies failure propagation, consumer-owned recovery, and independent retries.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { runMigrations, type Migration } from '../index';
import { step } from './helpers';

afterEach(() => vi.restoreAllMocks());

test('stops after rejection', async () => {
  const effects: string[] = [];
  const failure = new Error('Failed step');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
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
  expect(errors).not.toHaveBeenCalled();
});

test('continues when a migration handles its own failure', async () => {
  const effects: string[] = [];
  const failure = new Error('foo');
  const handledErrors: unknown[] = [];
  const migrations: Migration[] = [
    step('4', 'third', effects),
    {
      version: '3',
      async run() {
        effects.push('second');
        try {
          await Promise.reject(failure);
        } catch (error) {
          handledErrors.push(error);
        }
      },
    },
    step('2', 'first', effects),
  ];
  await expect(
    runMigrations(migrations, { previousVersion: '1', currentVersion: '4' }),
  ).resolves.toBeUndefined();
  expect(effects).toEqual(['first', 'second', 'third']);
  expect(handledErrors).toEqual([failure]);
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
