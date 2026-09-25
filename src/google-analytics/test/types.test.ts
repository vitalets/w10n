/**
 * Checks the public event type contract without dispatching analytics requests.
 */
import { expectTypeOf, test } from 'vitest';
import { createGoogleAnalytics, type ExceptionEvent } from '../index';

type Events =
  | { name: 'opened' }
  | { name: 'changed'; params: { setting: 'theme'; value: string | boolean } }
  | { name: 'optional'; params: { value?: number } }
  | { name: 'maybe'; params?: { value: number } };
const options = { measurementId: 'G-example', apiSecret: 'secret', clientId: '123.456' };

test('exposes a factory with correlated application event arguments', () => {
  expectTypeOf(createGoogleAnalytics<Events>).toBeFunction();
});

/**
 * Exercises accepted and rejected calls during TypeScript checking only.
 */
function checkTypes() {
  const analytics = createGoogleAnalytics<Events>(options);
  expectTypeOf(analytics.sendEvent('opened')).toEqualTypeOf<Promise<boolean>>();
  analytics.sendEvent('opened', undefined);
  analytics.sendEvent('changed', { setting: 'theme', value: true });
  analytics.sendEvent('optional');
  analytics.sendEvent('optional', { value: 1 });
  analytics.sendEvent('maybe');
  analytics.sendEvent('maybe', { value: 1 });
  // @ts-expect-error An event union must be supplied explicitly.
  createGoogleAnalytics(options);
  // @ts-expect-error Application events cannot redefine exception.
  createGoogleAnalytics<Events | ExceptionEvent>(options);
  // @ts-expect-error Unrestricted event names would include exception.
  createGoogleAnalytics<{ name: string }>(options);
  // @ts-expect-error Required parameters cannot be omitted.
  analytics.sendEvent('changed');
  // @ts-expect-error Required parameters cannot be undefined.
  analytics.sendEvent('changed', undefined);
  // @ts-expect-error Required fields cannot be omitted.
  analytics.sendEvent('changed', { setting: 'theme' });
  // @ts-expect-error Parameter values must match the event.
  analytics.sendEvent('changed', { setting: 'theme', value: 42 });
  // @ts-expect-error Object literals cannot contain excess parameters.
  analytics.sendEvent('changed', { setting: 'theme', value: true, extra: 1 });
  // @ts-expect-error Parameterless events cannot accept objects.
  analytics.sendEvent('opened', {});
  // @ts-expect-error Unknown names are rejected.
  analytics.sendEvent('unknown');
  // @ts-expect-error Exceptions must use sendException.
  analytics.sendEvent('exception', { description: 'example' });
  // @ts-expect-error Non-primitive parameters are unsupported.
  createGoogleAnalytics<{ name: 'invalid'; params: { value: object } }>(options);
  const name = '' as 'changed' | 'optional';
  // @ts-expect-error A union name cannot bypass name-parameter correlation.
  analytics.sendEvent(name, { value: 1 });
  expectTypeOf(analytics.sendException('example')).toEqualTypeOf<Promise<boolean>>();
}
void checkTypes;
