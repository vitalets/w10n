# Logger

A console-compatible logger controlled by `chrome.storage.local`, with
automatic initialization and synchronization between extension contexts.

## Features

- Console-compatible methods:
  * `logger.log`
  * `logger.info`
  * `logger.warn`
  * `logger.error` 
- Automatic initial loading and startup logs buffering.
- Logging state is saved in `chrome.storage.local`.
- Enable in build-time through `LOGGING` env var.

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

Start with the console-compatible logger methods:

```ts
import { logger } from "~/src/w10n/logger";

logger.log("Extension started");
```

Logging occurs when the stored runtime setting or forced logging is enabled.
Change the runtime setting for all extension contexts with
`setLoggingEnabled()`:

```ts
import { logger, setLoggingEnabled } from "~/src/w10n/logger";

await setLoggingEnabled(true);
logger.log("foo"); // -> prints "foo"

await setLoggingEnabled(false);
logger.info("bar"); // -> no output
```
