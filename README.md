# w10n

`w10n` is a numeronym for “web extension” and a collection of reusable
WebExtension TypeScript source modules.

Modules are copied into consumer repositories rather than consumed primarily as
runtime npm dependencies. The installed source is intended to be inspected,
modified, and maintained locally, including by coding agents.

## Principles

- Keep each module as self-contained as practical.
- Avoid dependencies between w10n modules.
- Prefer a small amount of duplication over a shared internal dependency graph.
- Avoid third-party runtime dependencies unless they provide substantial value.
- Use development-only dependencies in this repository when useful.
- Do not add abstraction or tooling before there is a concrete need for it.

## Modules

### Logger

`logger` provides console-compatible `log`, `info`, `warn`, and `error`
methods controlled by a setting in `chrome.storage.local`. It automatically
loads the setting when imported and synchronizes changes between extension
contexts.

Install it with:

```sh
npx shadcn@latest add vitalets/w10n/logger
```

Add the `storage` permission to the extension manifest:

```json
{
  "permissions": ["storage"]
}
```

Then use the logger and its runtime controls:

```ts
import {
  forceEnabled,
  loadLoggingEnabled,
  logger,
  setLoggingEnabled,
} from "~/src/w10n/logger";

logger.info("Extension started");
await setLoggingEnabled(true);

const runtimeEnabled = await loadLoggingEnabled();
console.log({ forceEnabled, runtimeEnabled });
```

Before the initial storage read finishes, writes are buffered and later flushed
in order when logging is enabled. The runtime setting is stored under
`logging-enabled`. Storage read failures discard buffered writes and are thrown
asynchronously so they do not block module import. Storage write failures reject
the promise returned by `setLoggingEnabled()` without rolling back the in-memory
setting.

`forceEnabled` is derived from `import.meta.env.LOGGING_ENABLED`; only `true`,
`"true"`, and `"1"` enable it. Forced logging takes effect immediately and
cannot be disabled by the runtime setting. Because the module is distributed as
source, consumers can edit the environment expression and storage key at the
top of `src/logger/index.ts` when their build or naming conventions differ.

### Storage

`storage` is currently a scaffold containing an empty public entrypoint. It does
not expose an API yet.

When the repository is publicly available on GitHub, install it with:

```sh
npx shadcn@latest add vitalets/w10n/storage
```

## Development

```sh
npm install
npm test
npm run tsc
npm run registry:validate
```

> When adding or removing distributable files in a module, update its `files`
> list in `registry.json`.

The shadcn validator detects invalid or missing referenced files, but cannot
detect new distributable files that were not added to the registry.
