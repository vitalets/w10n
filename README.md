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
