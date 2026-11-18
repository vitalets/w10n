# Logger

A console-compatible logger that always prints errors and controls other logging
through a preference in `chrome.storage.local`, with a build-time default.

## Usage

Import the logger and use its console-compatible `log`, `info`, `warn`, and `error` methods immediately:

```ts
import { logger } from './w10n/logger';

logger.log('Extension started');
```

## Change the logging setting

To change and persist the setting for `log`, `info`, and `warn` immediately, use
`setLoggingEnabled()`. Errors remain visible when logging is disabled:

```ts
import { setLoggingEnabled } from './w10n/logger';

await setLoggingEnabled(true);
```

## Installation

```sh
npx shadcn@latest add vitalets/w10n/logger
```

## Updating

Give your coding agent this instruction:

```text
Update local w10n logger module from https://github.com/vitalets/w10n/tree/main/src/logger,
preserving local customizations. Ask when unsure.
```

## Permissions

Add the `storage` permission to the extension manifest:

```json
{
  "permissions": ["storage"]
}
```

## Initialization and defaults

The setting is read from the `loggingEnabled` key. If that key does not exist,
`LOGGING` supplies its default value. Only `true`, `"true"`, and `"1"` enable
the environment default.

Errors print immediately, including before the setting loads, and preserve the
original arguments and Error objects. They are never buffered or suppressed.

The setting loads automatically when the module is imported. Until that initial
load resolves, `log`, `info`, and `warn` calls are buffered. They are flushed in
order if loading enables logging and discarded if loading disables it. This
ensures a stored `false` suppresses non-error startup logs even when the
environment default is enabled.

Storage read failures are reported with `console.error`. A failure during the
first load applies the environment default to buffered and future non-error logs.

Call `loadLoggingEnabled()` only when you need to read the setting from storage.
