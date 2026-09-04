/**
 * Verifies withErrorStack call-site preservation across common browser stack formats.
 */
import { afterEach, expect, test, vi } from 'vitest';
import { withErrorStack } from '../index';

const NativeError = Error;

afterEach(() => vi.unstubAllGlobals());

test('synchronous results pass through', async () => {
  await expect(withErrorStack(() => 'value')).resolves.toBe('value');
});

test('asynchronous results pass through', async () => {
  await expect(withErrorStack(() => Promise.resolve('value'))).resolves.toBe('value');
});

test('missing frames are replaced with caller frames', async () => {
  const error = new TypeError('failure');
  error.stack = undefined;

  await expect(callWithStackEnrichment(error)).rejects.toBe(error);

  expect(error.stack).toMatch(/^TypeError: failure\n/);
  expect(error.stack).toContain('callWithStackEnrichment');
  expect(error.stack).not.toContain('withErrorStack');
});

test('a message-only stack stays as the error header', async () => {
  const error = new Error('failure');
  error.stack = 'Error: failure';

  await expect(callWithStackEnrichment(error)).rejects.toBe(error);

  expect(error.stack).toMatch(/^Error: failure\n/);
  expect(error.stack).toContain('callWithStackEnrichment');
});

test.each([
  ['Chromium', 'Error: failure\n    at task (chrome-extension://id/background.js:1:2)'],
  ['Firefox', 'task@moz-extension://id/background.js:1:2'],
  ['Safari', 'safari-web-extension://id/background.js:1:2'],
])('existing %s frames stay unchanged', async (_browser, stack) => {
  const error = new Error('failure');
  error.stack = stack;

  await expect(withErrorStack(() => Promise.reject(error))).rejects.toBe(error);

  expect(error.stack).toBe(stack);
});

test('Firefox caller frames survive wrapper removal', async () => {
  const callerFrame = 'caller@moz-extension://id/background.js:3:4';

  class FirefoxStackError extends NativeError {
    stack = `withErrorStack@moz-extension://id/errors.js:1:2\n${callerFrame}`;
  }

  vi.stubGlobal('Error', FirefoxStackError);
  const error = { name: 'Error', message: 'failure', stack: 'Error: failure' };

  await expect(withErrorStack(() => Promise.reject(error))).rejects.toBe(error);

  expect(error.stack).toBe(`Error: failure\n${callerFrame}`);
});

test('primitive failures stay unchanged', async () => {
  await expect(
    withErrorStack(() => {
      throw 'failure';
    }),
  ).rejects.toBe('failure');
});

test('stack assignment failures do not replace the original error', async () => {
  const error = Object.freeze({ name: 'Error', message: 'failure', stack: 'Error: failure' });

  await expect(withErrorStack(() => Promise.reject(error))).rejects.toBe(error);
});

test('stack inspection failures do not replace the original error', async () => {
  const error = Object.defineProperty({}, 'stack', {
    get() {
      throw new Error('inspection failed');
    },
  });

  await expect(withErrorStack(() => Promise.reject(error))).rejects.toBe(error);
});

/**
 * Throws an error below a stable, observable caller frame.
 */
function callWithStackEnrichment(error: Error) {
  return withErrorStack(() => Promise.reject(error));
}
