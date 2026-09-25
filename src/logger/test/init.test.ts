/**
 * Verifies automatic logging initialization and explicit preference reloads.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { cleanupLogger, setupLogger } from './helpers';

afterEach(cleanupLogger);

test('logging is disabled by default', async () => {
  const app = await setupLogger();

  app.logger.log('foo');

  expect(app.storage.values).toEqual({});
  expect(app.stdout).toEqual([]);
});

test('LOGGING=1 enables logging automatically', async () => {
  const app = await setupLogger({ env: { LOGGING: '1' } });

  app.logger.log('foo');

  expect(app.storage.values).toEqual({});
  expect(app.stdout).toEqual([['log', 'foo']]);
});

test('startup logs are flushed in order when storage enables logging', async () => {
  const initialLoad = deferredLoad();
  const app = await setupLogger({ initialLoad: initialLoad.promise });

  app.logger.log('foo');
  app.logger.warn('bar');
  expect(app.stdout).toEqual([]);
  initialLoad.resolve({ loggingEnabled: true });

  await vi.waitFor(() => {
    expect(app.stdout).toEqual([
      ['log', 'foo'],
      ['warn', 'bar'],
    ]);
  });
  app.logger.info('baz');
  expect(app.stdout).toEqual([
    ['log', 'foo'],
    ['warn', 'bar'],
    ['info', 'baz'],
  ]);
});

test('stored false discards startup logs despite LOGGING=1', async () => {
  const initialLoad = deferredLoad();
  const app = await setupLogger({
    env: { LOGGING: '1' },
    initialLoad: initialLoad.promise,
  });

  app.logger.log('foo');
  initialLoad.resolve({ loggingEnabled: false });
  await app.storage.get.mock.results[0]!.value;
  app.logger.log('bar');
  await app.setLoggingEnabled(true);
  app.logger.log('baz');

  expect(app.stdout).toEqual([['log', 'baz']]);
});

test('a failed startup load reports the error and flushes using the default', async () => {
  const initialLoad = deferredLoad();
  const app = await setupLogger({
    env: { LOGGING: '1' },
    initialLoad: initialLoad.promise,
  });

  app.logger.log('foo');
  initialLoad.reject(new Error('read failed'));

  await vi.waitFor(() => {
    expect(app.stdout).toEqual([
      ['log', 'foo'],
      ['error', expect.objectContaining({ message: 'read failed' })],
    ]);
  });
  app.logger.log('bar');
  expect(app.stdout.at(-1)).toEqual(['log', 'bar']);
});

test('an explicit setting wins over the startup load', async () => {
  const initialLoad = deferredLoad();
  const app = await setupLogger({ initialLoad: initialLoad.promise });

  app.logger.log('foo');
  await app.setLoggingEnabled(true);
  initialLoad.resolve({ loggingEnabled: false });
  await app.storage.get.mock.results[0]!.value;
  app.logger.log('bar');

  expect(app.storage.values).toEqual({ loggingEnabled: true });
  expect(app.stdout).toEqual([
    ['log', 'foo'],
    ['log', 'bar'],
  ]);
});

test('the setting can be explicitly reloaded from storage', async () => {
  const app = await setupLogger();
  app.storage.values.loggingEnabled = true;

  await expect(app.loadLoggingEnabled()).resolves.toBe(true);
  app.logger.log('foo');

  expect(app.stdout).toEqual([['log', 'foo']]);
});

/**
 * Controls when the startup storage read succeeds or fails.
 */
function deferredLoad() {
  let resolve!: (value: Record<string, unknown>) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Record<string, unknown>>((resolveLoad, rejectLoad) => {
    resolve = resolveLoad;
    reject = rejectLoad;
  });
  return { promise, resolve, reject };
}
