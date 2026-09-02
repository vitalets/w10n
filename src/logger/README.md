# Logger

A console-compatible logger controlled by `chrome.storage.local`, with
automatic initialization and synchronization between extension contexts.

## Install

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

Start with the console-compatible logger methods:

```ts
import { logger } from "~/src/w10n/logger";

logger.info("Extension started");
// Extension started
```

Logging occurs when the stored runtime setting or forced logging is enabled.
Change the runtime setting for all extension contexts with
`setLoggingEnabled()`:

```ts
import { logger, setLoggingEnabled } from "~/src/w10n/logger";

await setLoggingEnabled(true);
logger.info("Logging enabled");
// Logging enabled

await setLoggingEnabled(false);
logger.info("This message is suppressed");
// No output
```

For settings or debugging interfaces, read the persisted runtime value and the
environment-controlled value separately:

```ts
import {
  enabledByEnv,
  loadLoggingEnabled,
} from "~/src/w10n/logger";

const runtimeEnabled = await loadLoggingEnabled();
// runtimeEnabled === true or false
// enabledByEnv === true or false
```

The `logger` object exposes `log`, `info`, `warn`, and `error`. Each method
accepts the same arguments as its `console` counterpart.

## Behavior

Importing the module starts loading the runtime setting from
`chrome.storage.local`. Until that read finishes, writes are buffered and later
flushed in order when logging is enabled. They are discarded when logging is
disabled or the read fails.

Runtime changes are saved under `logging-enabled` and synchronized between
extension contexts. Concurrent calls to `loadLoggingEnabled()` share the active
storage read; a call after it settles starts a fresh read.

Storage read failures disable runtime logging and are thrown asynchronously so
they do not block module import. Storage write failures reject the promise
returned by `setLoggingEnabled()` without rolling back the in-memory setting.

## Environment override

`enabledByEnv` is derived from `import.meta.env.LOGGING_ENABLED`. Only `true`,
`"true"`, and `"1"` enable it. Logging enabled by the environment takes effect
immediately and cannot be disabled by the runtime setting.

This module is distributed as source. Edit the environment expression or the
`storageKey` value at the top of `index.ts` when the consumer uses different
build or naming conventions.
