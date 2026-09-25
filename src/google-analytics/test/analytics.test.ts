/**
 * Verifies analytics payloads, session persistence, transport failures, and exception reporting.
 */
import { afterEach, beforeEach, expect, test, vi, type Mock } from 'vitest';
import {
  createGoogleAnalytics,
  type AnalyticsFailure,
  type GoogleAnalyticsOptions,
} from '../index';

type Events =
  { name: 'opened' } | { name: 'changed'; params: { value: string | boolean; omitted?: string } };
const config = { measurementId: 'G-example', apiSecret: 'secret', clientId: '123.456' };
let stored: Record<string, unknown>;
let requests: { url: string; body: string; signal: AbortSignal }[];
let failures: AnalyticsFailure[];
let events: EventTarget;
let fetchMock: Mock<(url: string, init: RequestInit) => Promise<Response>>;
let getStorage: ReturnType<typeof vi.fn>;
let setStorage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  stored = {};
  requests = [];
  failures = [];
  events = new EventTarget();
  getStorage = vi.fn(async () => structuredClone(stored));
  setStorage = vi.fn(async (values: Record<string, unknown>) =>
    Object.assign(stored, structuredClone(values)),
  );
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '1.2.3' }) },
    storage: { session: { get: getStorage, set: setStorage } },
  });
  vi.stubGlobal('document', undefined);
  vi.stubGlobal('navigator', { userAgent: 'Example Browser' });
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body as string, signal: init.signal as AbortSignal });
    return fetchMock(url, init);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('sends one typed event with extension context and user agent', async () => {
  expect(await client().sendEvent('changed', { value: true, omitted: undefined })).toBe(true);
  expect(JSON.parse(requests[0].body)).toEqual({
    client_id: '123.456',
    user_agent: 'Example Browser',
    events: [
      {
        name: 'changed',
        params: {
          value: true,
          page: 'background',
          content_group: 'background',
          extension_version: '1.2.3',
          session_id: '1800000000000',
          engagement_time_msec: 100,
        },
      },
    ],
  });
  expect(new URL(requests[0].url).searchParams.get('api_secret')).toBe('secret');
});

test('uses a simple CORS request without requiring host permission', async () => {
  await client().sendEvent('opened');
  const [url, init] = fetchMock.mock.calls[0];
  const request = new Request(url, init);
  expect(request.method).toBe('POST');
  expect(request.mode).toBe('cors');
  expect([...request.headers]).toEqual([['content-type', 'text/plain;charset=UTF-8']]);
});

test.each(['measurementId', 'apiSecret', 'clientId'] as const)(
  'rejects invalid %s during creation',
  (key) => {
    for (const value of [undefined, '', '  ', 123]) {
      expect(() => client({ [key]: value } as Partial<GoogleAnalyticsOptions>)).toThrow(key);
    }
    expect(requests).toEqual([]);
    expect(getStorage).not.toHaveBeenCalled();
  },
);

test('disabled clients skip all storage and network work', async () => {
  const analytics = client({ enabled: false });
  expect(await analytics.sendEvent('opened')).toBe(false);
  expect(await analytics.sendException('example')).toBe(false);
  expect(getStorage).not.toHaveBeenCalled();
  expect(setStorage).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
  expect(failures).toEqual([]);
});

test.each(['/', '/options/index.html', '/options/index.html?tab=general#theme'])(
  'reports document path %s',
  async (path) => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('location', new URL(`chrome-extension://example${path}`));
    const analytics = client();
    await analytics.sendEvent('opened');
    await analytics.sendException('example');
    for (const request of requests) {
      const params = JSON.parse(request.body).events[0].params;
      expect(params.page).toBe(`chrome-extension://example${path}`);
      expect(params.content_group).toBe(path);
    }
  },
);

test('truncates page and content group independently', async () => {
  const path = '/' + 'a'.repeat(150);
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', new URL(`chrome-extension://example${path}`));
  await client().sendEvent('opened');
  expect(payload().page).toBe(`chrome-extension://example${path}`.slice(0, 100));
  expect(payload().content_group).toBe(path.slice(0, 100));
});

test('module metadata overrides caller values including disabled debug mode', async () => {
  const analytics = createGoogleAnalytics<{
    name: 'opened';
    params: Record<string, string | number | boolean>;
  }>(config);
  await analytics.sendEvent('opened', {
    page: 'other',
    content_group: 'other',
    session_id: 'other',
    extension_version: 'other',
    engagement_time_msec: 50,
    debug_mode: true,
  });
  expect(payload()).toMatchObject({
    page: 'background',
    content_group: 'background',
    extension_version: '1.2.3',
    engagement_time_msec: 100,
  });
  expect(payload().session_id).not.toBe('other');
  expect(payload().debug_mode).toBeUndefined();
});

test('debug mode uses the normal endpoint and snapshots configuration', async () => {
  const options = { ...config, debug: true };
  const analytics = createGoogleAnalytics<Events>(options);
  options.debug = false;
  options.clientId = 'other';
  await analytics.sendEvent('opened');
  expect(requests[0].url).toContain('/mp/collect?');
  expect(payload().debug_mode).toBe(true);
  expect(JSON.parse(requests[0].body).client_id).toBe('123.456');
});

test('retries network failures with the original metadata and payload', async () => {
  fetchMock
    .mockRejectedValueOnce(new Error('private request'))
    .mockRejectedValueOnce(new Error('private request'));
  const result = client().sendEvent('opened');
  await vi.advanceTimersByTimeAsync(0);
  vi.stubGlobal('document', {});
  vi.stubGlobal('location', new URL('chrome-extension://example/other'));
  await vi.advanceTimersByTimeAsync(999);
  expect(requests).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(requests).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBe(true);
  expect(requests).toHaveLength(3);
  expect(new Set(requests.map((request) => request.body)).size).toBe(1);
  expect(setStorage).toHaveBeenCalledTimes(1);
  expect(failures).toEqual([]);
});

test.each([400, 429, 500, 503])('does not retry HTTP %s even with Retry-After', async (status) => {
  fetchMock.mockResolvedValue(new Response(null, { status, headers: { 'Retry-After': '30' } }));
  expect(await client().sendEvent('opened')).toBe(false);
  expect(requests).toHaveLength(1);
  expect(failures).toEqual([{ category: 'http', status, attempts: 1 }]);
});

test('reports final network failure without exposing request details', async () => {
  fetchMock.mockRejectedValue(new Error('secret payload and request URL'));
  const result = client().sendEvent('opened');
  await vi.runAllTimersAsync();
  expect(await result).toBe(false);
  expect(failures).toEqual([{ category: 'network', attempts: 3 }]);
});

test('aborts each timed out request and stops after three attempts', async () => {
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const result = client().sendEvent('opened');
  await vi.runAllTimersAsync();
  expect(await result).toBe(false);
  expect(requests).toHaveLength(3);
  expect(requests.every((request) => request.signal.aborted)).toBe(true);
  expect(failures).toEqual([{ category: 'timeout', attempts: 3 }]);
});

test('storage failure does not poison later sends', async () => {
  getStorage.mockRejectedValueOnce(new Error('private storage data'));
  const analytics = client();
  expect(await analytics.sendEvent('opened')).toBe(false);
  expect(await analytics.sendEvent('opened')).toBe(true);
  expect(failures).toEqual([{ category: 'storage', attempts: 0 }]);
});

test('serialization failures resolve false', async () => {
  const params = {
    get value(): string {
      throw new Error('private value');
    },
  };
  expect(await client().sendEvent('changed', params)).toBe(false);
  expect(requests).toEqual([]);
  expect(failures).toEqual([{ category: 'serialization', attempts: 0 }]);
});

test.each([false, true])('contains error callback failures (async: %s)', async (asyncFailure) => {
  fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
  const onError = () => {
    if (asyncFailure) return Promise.reject(new Error('callback failure'));
    throw new Error('callback failure');
  };
  expect(await client({ onError }).sendEvent('opened')).toBe(false);
});

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
  let releaseWrite!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  setStorage.mockImplementationOnce(async (values: Record<string, unknown>) => {
    await firstWrite;
    Object.assign(stored, structuredClone(values));
  });
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
  expect(stored.googleAnalyticsSession).toBeUndefined();
  expect(setStorage).toHaveBeenCalledTimes(2);
});

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

test('capture preserves browser reporting and shares limits with manual reports', async () => {
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
  for (let i = 0; i < 7; i++) await analytics.sendException(`value ${i}`);
  emit('error', { message: 'another' });
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toHaveLength(10);
});

test('capture cleanup is idempotent and does not disable manual reporting', async () => {
  const analytics = client();
  const stop = analytics.captureExceptions();
  expect(analytics.captureExceptions()).toBe(stop);
  emit('error', {});
  await vi.advanceTimersByTimeAsync(0);
  expect(requests).toEqual([]);
  emit('error', { message: 'first' });
  await vi.advanceTimersByTimeAsync(0);
  stop();
  stop();
  emit('error', { message: 'second' });
  expect(await analytics.sendException('manual')).toBe(true);
  const stopAgain = analytics.captureExceptions();
  stop();
  emit('error', { message: 'first' });
  emit('error', { message: 'second' });
  await vi.advanceTimersByTimeAsync(0);
  expect(requests.map((_, i) => payload(i).description)).toEqual(['first', 'manual', 'second']);
  stopAgain();
});

/**
 * Creates a client that collects safe failure outcomes for assertions.
 */
function client(options: Partial<GoogleAnalyticsOptions> = {}) {
  return createGoogleAnalytics<Events>({
    ...config,
    onError: (failure) => {
      failures.push(failure);
    },
    ...options,
  });
}

/**
 * Reads the event parameters delivered by a recorded HTTP request.
 */
function payload(index = 0) {
  return JSON.parse(requests[index].body).events[0].params;
}

/**
 * Dispatches a browser-like exception event without suppressing its default behavior.
 */
function emit(type: string, values: Record<string, unknown>) {
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  events.dispatchEvent(event);
  return event;
}
