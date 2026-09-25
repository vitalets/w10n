# Google Analytics

Typed GA4 events and bounded exception reporting with configurable delivery retries.

## Key behavior

- Sends typed application events and normalized exceptions through one GA4 client.

## Installation

```sh
npx shadcn@latest add vitalets/w10n/google-analytics
```

## Requirements

Use in Manifest V3 background workers and extension-owned document pages. Content
scripts and ordinary websites are outside scope. Each supported context creates
its own client and sends directly. The module uses Promise-based `chrome` APIs
and `chrome.storage.session`; test compatibility before targeting other browsers.

Declare storage access in the extension manifest:

```json
{
  "permissions": ["storage"]
}
```

The GA4 endpoint allows CORS requests, so analytics does not require a host
permission. Following [Chrome's GA4 example](https://developer.chrome.com/docs/extensions/how-to/integrate/google-analytics-4),
the module sends a JSON string body without an explicit `application/json` header,
avoiding a CORS preflight while retaining access to the HTTP response. If the
extension sets `connect-src` or `default-src` in its content security policy, allow
`https://www.google-analytics.com` there.

Supply a GA4 measurement ID, Measurement Protocol API secret, and a stable client
ID. The extension owns client-ID creation and persistence. Use a client ID accepted
by [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference?client_type=gtag).

## Typed events

Define separate event types and combine them into an explicit union:

```ts
import { createGoogleAnalytics } from './w10n/google-analytics';

type SettingChangedEvent = {
  name: 'setting_changed';
  params: { setting: 'theme' | 'open_in_new_tab'; value: string | boolean };
};
type WelcomeOpenedEvent = { name: 'welcome_opened' };
type ExtensionEvent = SettingChangedEvent | WelcomeOpenedEvent;

export const analytics = createGoogleAnalytics<ExtensionEvent>({
  measurementId: 'G-...',
  apiSecret: '...',
  clientId: installationId, // Supplied by the extension.
});

await analytics.sendEvent('setting_changed', { setting: 'theme', value: 'dark' });
await analytics.sendEvent('welcome_opened');
```

Event names and parameters remain correlated. Required fields require a parameter
object; all-optional parameters may be omitted. Parameterless events accept just
the name or an undefined second argument. Supported values are strings, numbers,
booleans, and undefined; undefined values are omitted from JSON. Types do not
perform runtime schema validation. Application parameters must respect GA4 name,
value, and parameter-count limits, including space for automatic metadata.

`exception` is reserved: use `sendException` instead of `sendEvent`. The exported
`ExceptionEvent` type describes exception fields before automatic metadata is
appended; it cannot be included in the application event union.

## Configuration

| Option                       | Default                  | Purpose                                             |
| ---------------------------- | ------------------------ | --------------------------------------------------- |
| `measurementId`              | Required                 | GA4 stream identifier                               |
| `apiSecret`                  | Required                 | Measurement Protocol credential                     |
| `clientId`                   | Required                 | Extension-owned installation identity               |
| `enabled`                    | `true`                   | Enables sending                                     |
| `debug`                      | `false`                  | Adds `debug_mode` on the normal collection endpoint |
| `retries`                    | `3`                      | Retries after the initial network attempt           |
| `sessionStorageKey`          | `googleAnalyticsSession` | Shared session storage key                          |
| `onError`                    | Optional                 | Receives sanitized failure details                  |
| `preprocessExceptionMessage` | Optional                 | Transforms normalized exception descriptions        |

Configuration is copied at creation and fixed for the client lifetime. Missing,
non-string, or blank identifiers throw synchronously, including for disabled
clients. `retries` must be a non-negative safe integer; invalid values also throw
synchronously. Set `retries: 0` to disable retries. Disabled sends return false without storage or network operations.

## Exceptions

Report a caught value explicitly:

```ts
try {
  // ...
} catch (error) {
  await analytics.sendException(error);
}
```

Enable automatic capture separately:

```ts
const stopCapture = analytics.captureExceptions();
// ...
stopCapture();
```

Capture listens for `error` and `unhandledrejection`, ignoring resource errors
without an error or message and preserving normal browser reporting. Repeated
calls reuse the active registration and cleanup function. Cleanup is idempotent;
manual reporting continues, and capture may be enabled again.

Both paths normalize arbitrary caught values safely. Reports use `description`,
optional `stack`, `fatal: false`, and `error_kind` (`caught_error`, `uncaught_error`,
or `unhandled_rejection`). Descriptions and stacks are limited to 100 characters.
A redundant first stack line is removed before message preprocessing.

Each client reports at most ten unique exceptions in its lifetime. Deduplication
uses error kind, final description, and final stack. Reports are recorded before
dispatch, so failures count toward the cap. Cleanup and capture restart do not
reset the cap or deduplication state.

## Preprocess exception messages

Configure a synchronous callback to replace tab IDs or other varying message text:

```ts
const analytics = createGoogleAnalytics<ExtensionEvent>({
  measurementId: 'G-...',
  apiSecret: '...',
  clientId: installationId,
  preprocessExceptionMessage: (message) => message.replace(/\d{6,}/g, 'XXXXXXXXX'),
});
```

This transforms `Error: No tab with id: 882489154.` into
`Error: No tab with id: XXXXXXXXX.`. It runs for both reporting paths on the full
normalized description, before truncation and deduplication. Stack frames and
application parameters are not transformed; different stacks or error kinds still
produce distinct reports.

If preprocessing throws or returns a non-string, `onError` receives a
`preprocessing` failure and reporting continues with the original normalized
message. Normal truncation, deduplication, and caps apply. A subsequent sending
failure generates its own `onError` notification.

## Automatic metadata

| Parameter              | Background worker | Extension document                                   |
| ---------------------- | ----------------- | ---------------------------------------------------- |
| `page`                 | `background`      | `location.href`, truncated to 100 characters         |
| `content_group`        | `background`      | Path + query + fragment, truncated to 100 characters |
| `extension_version`    | Manifest version  | Manifest version                                     |
| `session_id`           | Managed session   | Managed session                                      |
| `engagement_time_msec` | `100`             | `100`                                                |

The document content group preserves the leading slash; for example,
`/options/index.html?tab=general#theme`. Both URL fields include query strings and
fragments, subject to independent truncation. Caller parameters cannot override
module-owned metadata, including `debug_mode`. The fixed engagement value is a
minimal event value, not a measurement of time spent on a page. There are no
automatic page views.

## Sessions and delivery

Session state contains `{ sessionId, timestamp }` in `chrome.storage.session`.
Clients using the same storage key share session activity. Sessions expire after
more than 30 idle minutes; malformed state is recreated. Activity refreshes once
per logical send. Session operations are serialized within a client; simultaneous
initialization across contexts remains best-effort.

Session storage survives worker restarts, but is cleared by browser restart or
extension reload, update, or disable. No persistent event queue is maintained.

Both sending methods resolve to `true` on HTTP success and `false` when skipped
or failed. Preparation and sending failures never reject. HTTP success does not
guarantee GA processing. Network errors and ten-second request timeouts receive
up to three retries by default (four attempts total), with one-, two-, and
three-second waits. The `retries` option controls this limit; each successive
retry waits one second longer. Retries reuse the serialized
payload and may produce duplicates. HTTP failures, including 429 and 5xx, are not
retried; `Retry-After` is ignored.

Delivery, promise completion, and final callbacks depend on the sending context
remaining alive. Worker termination or document closure may interrupt reporting
without a result or callback. There are no keepalives, alarms, batching, or queues.

`onError` receives an `AnalyticsFailure` with `category`, `attempts`, and an HTTP
`status` when available. Categories are `metadata`, `storage`, `serialization`,
`network`, `timeout`, `http`, and `preprocessing`. Preparation failures have zero
attempts. Final transport failure notifies once; skipping alone does not notify.
Details exclude credentials, request URLs, payloads, and thrown values. Callback
exceptions and rejections are contained, and transport failures are never reported
as analytics events.
