# Logger

A console-compatible logger that automatically loads its preference from
`chrome.storage.local`, with a build-time default.

## Features

- Console-compatible `log`, `info`, `warn`, and `error` methods.
- A build-time default configured through the `LOGGING` environment variable.
- Automatic loading of the setting in `chrome.storage.local`.
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

Import the logger and use its console-compatible methods immediately:

```ts
import { logger } from './w10n/logger';

logger.log('Extension started');
```

The setting is read from the `loggingEnabled` key. If that key does not exist,
`LOGGING` supplies its default value. Only `true`, `"true"`, and `"1"` enable
the environment default.

The setting loads automatically when the module is imported. Until that initial
load resolves, logger calls are buffered. They are flushed in order if loading
enables logging and discarded if loading disables it. This ensures a stored
`false` suppresses startup logs even when the environment default is enabled.

Storage read failures are reported with `console.error`. A failure during the
first load applies the environment default to buffered and future logs.

Call `loadLoggingEnabled()` only when you need to reload the setting from storage.

To change and persist the setting immediately, use `setLoggingEnabled()`:

```ts
import { setLoggingEnabled } from './w10n/logger';

await setLoggingEnabled(true);
```
