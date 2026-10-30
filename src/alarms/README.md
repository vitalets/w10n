# Alarms

Create alarms and attach listeners without resetting existing schedules.

## Set up an alarm with a listener

Use `setupAlarm(name, params, listener?)` to ensure a named alarm exists and
attach a listener in one call. It creates the alarm only if missing and invokes
your listener whenever that alarm fires.

```ts
import { setupAlarm } from './w10n/alarms';

setupAlarm('refresh', { periodInMinutes: 5 }, (alarm) => {
  // ...
});
```

An existing alarm keeps its schedule and parameters. The listener receives the
matching `chrome.alarms.Alarm` object and is registered synchronously, so setup
can run directly in your service-worker entry point.

Call setup once per name during startup: repeated calls add more listeners.
Avoid concurrent initialization of the same name, which can replace its schedule.

## Ensure an alarm exists

Use `ensureAlarm(name, params)` to create a missing alarm without attaching a
listener. This is useful when you already handle alarm events elsewhere.
Existing alarms keep their schedule and parameters.

## Installation

```sh
npx shadcn@latest add vitalets/w10n/alarms
```

## Permissions

Declare the `alarms` permission in the extension manifest:

```json
{
  "permissions": ["alarms"]
}
```

Requires Manifest V3 and Chrome 111+, or compatible Promise APIs on `chrome.alarms`.

## Error handling

Both functions return `Promise<void>` and reject if lookup or creation fails.
Handle rejections at your app's initialization boundary. A setup failure leaves
the listener registered.

Handle callback errors separately; callback promises are not awaited by the module.
