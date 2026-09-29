/**
 * Delivers analytics payloads with bounded attempts and sanitized failure outcomes.
 */
import type { AnalyticsFailure } from './index';

/**
 * Bounds each analytics request attempt.
 */
const REQUEST_TIMEOUT_MS = 10_000;
type TransportOptions = { retries: number; notify: (failure: AnalyticsFailure) => void };

/**
 * Retries only ambiguous network failures while retaining the original payload.
 */
export async function transmit(url: string, body: string, options: TransportOptions) {
  for (let attempts = 1; attempts <= options.retries + 1; attempts++) {
    const result = await request(url, body);
    if (result.category === 'http') return handleResponse(result, attempts, options);
    if (attempts === options.retries + 1) {
      options.notify({ category: result.category, attempts });
      return false;
    }
    await delay(attempts * 1000);
  }
  return false;
}

/**
 * Reports unsuccessful HTTP responses without retrying them.
 */
function handleResponse(
  result: { ok: boolean; status: number },
  attempts: number,
  options: TransportOptions,
) {
  if (result.ok) return true;
  options.notify({ category: 'http', status: result.status, attempts });
  return false;
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
 * Waits between network attempts while the sending context remains alive.
 */
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
