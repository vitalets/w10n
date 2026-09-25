/**
 * Sends typed extension events and exceptions through the GA4 Measurement Protocol.
 */
import { createExceptionReporter } from './exceptions';
export type { ExceptionEvent } from './exceptions';

type AnalyticsParameter = string | number | boolean | undefined;
type AnalyticsEvent = { name: string; params?: Record<string, AnalyticsParameter> };
export type AnalyticsFailure = {
  category:
    'metadata' | 'storage' | 'serialization' | 'network' | 'timeout' | 'http' | 'preprocessing';
  attempts: number;
  status?: number;
};
export type GoogleAnalyticsOptions = {
  measurementId: string;
  apiSecret: string;
  clientId: string;
  enabled?: boolean;
  debug?: boolean;
  sessionStorageKey?: string;
  onError?: (failure: AnalyticsFailure) => void | Promise<void>;
  preprocessExceptionMessage?: (message: string) => string;
};
type EventArguments<Event extends AnalyticsEvent> = Event extends unknown
  ? 'params' extends keyof Event
    ? {} extends NonNullable<Event['params']>
      ? [name: Event['name'], params?: Event['params']]
      : undefined extends Event['params']
        ? [name: Event['name'], params?: Event['params']]
        : [name: Event['name'], params: Event['params']]
    : [name: Event['name'], params?: undefined]
  : never;
type Configuration<Event extends AnalyticsEvent> = [Event] extends [never]
  ? never
  : 'exception' extends Event['name']
    ? never
    : GoogleAnalyticsOptions;
type Session = { sessionId: string; timestamp: number };
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const SESSION_IDLE_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Creates a fixed-configuration analytics client for one extension context.
 */
export function createGoogleAnalytics<Event extends AnalyticsEvent = never>(
  options: Configuration<Event>,
) {
  const config = { ...options };
  for (const key of ['measurementId', 'apiSecret', 'clientId'] as const) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`Missing or invalid analytics ${key}`);
    }
  }
  const url = new URL(GA_ENDPOINT);
  url.searchParams.set('measurement_id', config.measurementId);
  url.searchParams.set('api_secret', config.apiSecret);
  let sessionTail = Promise.resolve();
  const exceptions = createExceptionReporter({
    enabled: config.enabled !== false,
    send,
    preprocess: config.preprocessExceptionMessage,
    onPreprocessingFailure,
  });
  return { sendEvent, ...exceptions };

  /**
   * Sends an application event with correlated name and parameter types.
   */
  function sendEvent(...args: EventArguments<Event>) {
    return send(args[0], args[1]);
  }

  /**
   * Prepares a logical send once and contains all preparation and transport failures.
   */
  async function send(name: string, params?: Record<string, AnalyticsParameter>) {
    if (config.enabled === false) return false;
    let category: AnalyticsFailure['category'] = 'metadata';
    try {
      const metadata = getMetadata();
      const userAgent = navigator.userAgent;
      category = 'storage';
      const session = sessionTail.then(refreshSession);
      sessionTail = session.then(ignoreResult, ignoreResult);
      const sessionId = await session;
      category = 'serialization';
      const eventParams = { ...params };
      delete eventParams.debug_mode;
      const body = JSON.stringify({
        client_id: config.clientId,
        user_agent: userAgent,
        events: [
          {
            name,
            params: {
              ...eventParams,
              ...metadata,
              session_id: sessionId,
              engagement_time_msec: 100,
              ...(config.debug ? { debug_mode: true } : {}),
            },
          },
        ],
      });
      return await transmit(body);
    } catch {
      notify({ category, attempts: 0 });
      return false;
    }
  }

  /**
   * Retries only ambiguous network failures while retaining the original payload.
   */
  async function transmit(body: string) {
    for (let attempts = 1; attempts <= 3; attempts++) {
      const result = await request(url.href, body);
      if (result.category === 'http') {
        if (result.ok) return true;
        notify({ category: 'http', status: result.status, attempts });
        return false;
      }
      if (attempts === 3) {
        notify({ category: result.category, attempts });
        return false;
      }
      await delay(attempts * 1000);
    }
    return false;
  }

  /**
   * Refreshes shared session activity after earlier operations in this client settle.
   */
  async function refreshSession() {
    const key = config.sessionStorageKey ?? 'googleAnalyticsSession';
    const values = await chrome.storage.session.get(key);
    const now = Date.now();
    const stored: unknown = values[key];
    const session =
      isSession(stored) && stored.timestamp <= now && now - stored.timestamp <= SESSION_IDLE_MS
        ? { sessionId: stored.sessionId, timestamp: now }
        : { sessionId: String(now), timestamp: now };
    await chrome.storage.session.set({ [key]: session });
    return session.sessionId;
  }

  /**
   * Reports preprocessing failure separately from the fallback send outcome.
   */
  function onPreprocessingFailure() {
    notify({ category: 'preprocessing', attempts: 0 });
  }

  /**
   * Delivers sanitized failure details without allowing callback failures to escape.
   */
  function notify(failure: AnalyticsFailure) {
    try {
      void Promise.resolve(config.onError?.(failure)).catch(ignoreResult);
    } catch {
      // Error callbacks must not interrupt analytics or create recursive reports.
    }
  }
}

/**
 * Runs one bounded HTTP attempt and exposes only safe outcome information.
 */
async function request(url: string, body: string) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('Analytics timeout'));
      }, REQUEST_TIMEOUT_MS);
    });
    const response = await Promise.race([
      fetch(url, {
        method: 'POST',
        // A string body uses a CORS-safelisted content type, avoiding a preflight.
        body,
        signal: controller.signal,
      }),
      timeout,
    ]);
    return { category: 'http' as const, ok: response.ok, status: response.status };
  } catch {
    return { category: timedOut ? ('timeout' as const) : ('network' as const) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Captures extension-owned context metadata at the start of a logical send.
 */
function getMetadata() {
  const isBackground = typeof document === 'undefined';
  return {
    page: isBackground ? 'background' : location.href.slice(0, 100),
    content_group: isBackground
      ? 'background'
      : (location.pathname + location.search + location.hash).slice(0, 100),
    extension_version: chrome.runtime.getManifest().version,
  };
}

/**
 * Recognizes a persisted numeric session identity with a valid activity timestamp.
 */
function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<Session>;
  return (
    typeof session.sessionId === 'string' &&
    /^\d+$/.test(session.sessionId) &&
    Number.isFinite(Number(session.sessionId)) &&
    Number(session.sessionId) > 0 &&
    typeof session.timestamp === 'number' &&
    Number.isFinite(session.timestamp) &&
    session.timestamp >= 0
  );
}

/**
 * Waits between network attempts while the sending context remains alive.
 */
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Contains a completed operation without retaining its result.
 */
function ignoreResult() {}
