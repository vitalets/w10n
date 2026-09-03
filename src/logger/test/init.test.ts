/**
 * Verifies initializing logging from environment and storage settings.
 */
import { afterEach, expect, test } from 'vitest';
import { cleanupLogger, setupLogger } from './helpers';

afterEach(cleanupLogger);

test('logging is disabled by default', async () => {
  const app = await setupLogger();

  await expect(app.loadLoggingEnabled()).resolves.toBe(false);
  app.logger.log('foo');

  expect(app.storage.values).toEqual({});
  expect(app.stdout).toEqual([]);
});

test('LOGGING=1 enables logging by default', async () => {
  const app = await setupLogger({ env: { LOGGING: '1' } });

  app.logger.log('foo');
  expect(app.stdout).toEqual([]);

  await app.loadLoggingEnabled();

  expect(app.storage.values).toEqual({});
  expect(app.stdout).toEqual([['log', 'foo']]);
});

test('storage value overrides LOGGING=1', async () => {
  const app = await setupLogger({
    env: { LOGGING: '1' },
    storage: { loggingEnabled: false },
  });

  const load = app.loadLoggingEnabled();
  app.logger.log('foo');
  await load;
  app.logger.log('bar');

  expect(app.storage.values).toEqual({ loggingEnabled: false });
  expect(app.stdout).toEqual([]);
});

test('enable logging by storage', async () => {
  const app = await setupLogger({
    storage: { loggingEnabled: true },
  });

  app.logger.log('foo');
  await app.loadLoggingEnabled();
  app.logger.log('bar');

  expect(app.storage.values).toEqual({ loggingEnabled: true });
  expect(app.stdout).toEqual([
    ['log', 'foo'],
    ['log', 'bar'],
  ]);
});

test('a failed load logs the error and keeps logging default', async () => {
  const app = await setupLogger({ env: { LOGGING: '1' } });
  app.storage.queueGet(Promise.reject(new Error('read failed')));

  await app.loadLoggingEnabled();
  app.logger.log('foo');

  expect(app.storage.values).toEqual({});
  expect(app.stdout).toEqual([
    ['error', expect.objectContaining({ message: 'read failed' })],
    ['log', 'foo'],
  ]);
});
