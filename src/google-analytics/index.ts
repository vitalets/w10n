/**
 * Sends typed extension events and exceptions through the GA4 Measurement Protocol.
 */
import { createExceptionReporter } from './exceptions';
import { refreshSession } from './session';
import { transmit } from './transport';

/**
 * Receives GA4 Measurement Protocol events.
 */
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
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
  retries?: number;
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

type SendContext = {
  metadata: ReturnType<typeof getMetadata>;
  userAgent: string;
  sessionId: string;
};

/**
 * Creates a fixed-configuration analytics client for one extension context.
 */
export function createGoogleAnalytics<Event extends AnalyticsEvent = never>(
  options: Configuration<Event>,
) {
  const config = { ...options };
  const client = new AnalyticsClient(config);
  const exceptions = createExceptionReporter({
    enabled: config.enabled !== false,
    send: (name, params) => client.send(name, params),
    preprocess: config.preprocessExceptionMessage,
    onPreprocessingFailure: () => client.notify({ category: 'preprocessing', attempts: 0 }),
  });
  return { sendEvent, ...exceptions };

  /**
   * Sends an application event with correlated name and parameter types.
   */
  function sendEvent(...args: EventArguments<Event>) {
    return client.send(args[0], args[1]);
  }
}

/**
 * Coordinates preparation and serialized session activity for one client.
 */
class AnalyticsClient {
  private sessionTail = Promise.resolve();
  private retries: number;
  private url: string;

  constructor(private config: GoogleAnalyticsOptions) {
    this.retries = validateConfiguration(config);
    this.url = getCollectionUrl(config);
  }

  /**
   * Prepares a logical send once and contains all preparation and transport failures.
   */
  async send(name: string, params?: Record<string, AnalyticsParameter>) {
    if (this.config.enabled === false) return false;
    let category: AnalyticsFailure['category'] = 'metadata';
    try {
      const metadata = getMetadata();
      const userAgent = navigator.userAgent;
      category = 'storage';
      const sessionId = await this.refreshSession();
      category = 'serialization';
      const body = this.serialize({ name, params }, { metadata, userAgent, sessionId });
      return await transmit(this.url, body, { retries: this.retries, notify: this.notify });
    } catch {
      this.notify({ category, attempts: 0 });
      return false;
    }
  }

  /**
   * Queues session activity without letting failed storage work block later sends.
   */
  private refreshSession() {
    const session = this.sessionTail.then(() =>
      refreshSession(this.config.sessionStorageKey ?? 'googleAnalyticsSession'),
    );
    this.sessionTail = session.then(ignoreResult, ignoreResult);
    return session;
  }

  /**
   * Serializes an event with captured context and authoritative module parameters.
   */
  private serialize({ name, params }: AnalyticsEvent, context: SendContext) {
    const eventParams = { ...params };
    delete eventParams.debug_mode;
    return JSON.stringify({
      client_id: this.config.clientId,
      user_agent: context.userAgent,
      events: [
        {
          name,
          params: {
            ...eventParams,
            ...context.metadata,
            session_id: context.sessionId,
            engagement_time_msec: 100,
            ...(this.config.debug ? { debug_mode: true } : {}),
          },
        },
      ],
    });
  }

  /**
   * Delivers sanitized failure details without allowing callback failures to escape.
   */
  notify = (failure: AnalyticsFailure) => {
    try {
      void Promise.resolve(this.config.onError?.(failure)).catch(ignoreResult);
    } catch {
      // Error callbacks must not interrupt analytics or create recursive reports.
    }
  };
}

/**
 * Rejects invalid fixed configuration before creating client state.
 */
function validateConfiguration(config: GoogleAnalyticsOptions) {
  validateCredentials(config);
  const retries = config.retries ?? 3;
  if (!Number.isSafeInteger(retries) || retries < 0) {
    throw new Error('Invalid analytics retries: expected a non-negative safe integer');
  }
  return retries;
}

/**
 * Requires nonempty analytics destination and client credentials.
 */
function validateCredentials(config: GoogleAnalyticsOptions) {
  for (const key of ['measurementId', 'apiSecret', 'clientId'] as const) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`Missing or invalid analytics ${key}`);
    }
  }
}

/**
 * Builds the collection URL for a fixed analytics destination.
 */
function getCollectionUrl(config: GoogleAnalyticsOptions) {
  const url = new URL(GA_ENDPOINT);
  url.searchParams.set('measurement_id', config.measurementId);
  url.searchParams.set('api_secret', config.apiSecret);
  return url.href;
}

/**
 * Captures extension-owned context metadata at the start of a logical send.
 */
function getMetadata() {
  const isBackground = typeof document === 'undefined';
  return {
    content_group: isBackground ? 'background' : location.pathname.slice(-100),
    extension_version: chrome.runtime.getManifest().version,
  };
}

/**
 * Contains a completed operation without retaining its result.
 */
function ignoreResult() {}
