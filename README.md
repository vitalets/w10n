# w10n

`w10n` is a numeronym for “webextension” and a collection of reusable
WebExtension TypeScript source modules.

Modules are copied into consumer repositories rather than consumed primarily as
runtime npm dependencies. The installed source is intended to be inspected,
modified, and maintained locally, including by AI agents.

## Modules

- [Storage](src/storage/README.md)
- [Logger](src/logger/README.md)
- [Errors](src/errors/README.md)
- [Google Analytics](src/google-analytics/README.md)
- [Context Menu](src/context-menu/README.md)

## Example extension

The [example extension](example/README.md) uses all modules with vanilla TypeScript
and CRXJS. See its README for setup and usage.

## Principles

- Keep each module as self-contained as practical.
- Avoid dependencies between w10n modules.
- Prefer a small amount of duplication over a shared internal dependency graph.
- Avoid third-party runtime dependencies unless they provide substantial value.
- Use development-only dependencies in this repository when useful.
- Do not add abstraction or tooling before there is a concrete need for it.

## Development

```sh
npm install
npm test
npm run tsc
npm run lint
npm run registry:validate
```

ESLint uses the recommended JavaScript and TypeScript rules and respects the root
and example `.gitignore` files. Run `npm run lint -- --fix` to apply available fixes.

> When adding or removing distributable files in a module, update its `files`
> list in `registry.json`.

The shadcn validator detects invalid or missing referenced files, but cannot
detect new distributable files that were not added to the registry.
