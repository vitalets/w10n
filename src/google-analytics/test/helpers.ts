/**
 * Provides browser, storage, and transport state for analytics behavior tests.
 */
import { afterEach, beforeEach, vi, type Mock } from 'vitest';
import {
  createGoogleAnalytics,
  type AnalyticsFailure,
  type GoogleAnalyticsOptions,
} from '../index';

export type Events =
  { name: 'opened' } | { name: 'changed'; params: { value: string | boolean; omitted?: string } };
export const config = { measurementId: 'G-example', apiSecret: 'secret', clientId: '123.456' };
export let stored: Record<string, unknown>;
export let requests: { url: string; body: string; signal: AbortSignal }[];
export let failures: AnalyticsFailure[];
let events: EventTarget;
export let fetchMock: Mock<(url: string, init: RequestInit) => Promise<Response>>;
export let getStorage: ReturnType<typeof vi.fn>;
export let setStorage: ReturnType<typeof vi.fn>;

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
  installBrowser();
  installFetch();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/**
 * Creates a client that collects safe failure outcomes for assertions.
 */
export function client(options: Partial<GoogleAnalyticsOptions> = {}) {
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
export function payload(index = 0) {
  return JSON.parse(requests[index].body).events[0].params;
}

/**
 * Dispatches a browser-like exception event without suppressing its default behavior.
 */
export function emit(type: string, values: Record<string, unknown>) {
  const event = Object.assign(new Event(type, { cancelable: true }), values);
  events.dispatchEvent(event);
  return event;
}

/**
 * Installs browser globals backed by the current test state.
 */
function installBrowser() {
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '1.2.3' }) },
    storage: { session: { get: getStorage, set: setStorage } },
  });
  vi.stubGlobal('document', undefined);
  vi.stubGlobal('navigator', { userAgent: 'Example Browser' });
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
}

/**
 * Records outgoing requests and supplies controlled transport outcomes.
 */
function installFetch() {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body as string, signal: init.signal as AbortSignal });
    return fetchMock(url, init);
  });
}
