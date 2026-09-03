# Logger

A console-compatible logger with a build-time default that can be replaced from
`chrome.storage.local`.

## Features

- Console-compatible `log`, `info`, `warn`, and `error` methods.
- A build-time default configured through the `LOGGING` environment variable.
- An explicit loader for applying the setting in `chrome.storage.local`.
- An immediate setter that also persists the setting.

## Installation

```sh
npx shadcn@latest add vitalets/w10n/logger
```

Add the `storage` permission to the extension manifest:

```json
{
  "permissions": ["storage"]
}
```

## Usage

Load the persisted setting during extension startup, then use the
console-compatible logger methods:

```ts
import { loadLoggingEnabled, logger } from '~/src/w10n/logger';

await loadLoggingEnabled();
logger.log('Extension started');
```

The setting is read from the `loggingEnabled` key. If that key does not exist,
`LOGGING` supplies its default value. Only `true`, `"true"`, and `"1"` enable
the environment default.

Before the first `loadLoggingEnabled()` call resolves, logger calls are
buffered. They are flushed in order if loading enables logging and discarded if
loading disables it. This ensures a stored `false` suppresses startup logs even
when the environment default is enabled.

Storage read failures are reported with `console.error`. A failure during the
first load applies the environment default to buffered and future logs.

To change and persist the setting immediately, use `setLoggingEnabled()`:

```ts
import { setLoggingEnabled } from '~/src/w10n/logger';

await setLoggingEnabled(true);
```
