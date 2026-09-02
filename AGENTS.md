# AGENTS.md

## Project overview

`w10n` is a collection of reusable TypeScript source modules for WebExtension
projects. Consumers copy module source into their repositories through the
shadcn registry, so published code must be easy to inspect, modify, and maintain
without depending on this repository at runtime.

## Repository layout

- `src/<module>/`: distributable module source. Each module exposes its public
  API from `index.ts`.
- `registry.json`: shadcn registry metadata and the explicit list of files
  distributed for each module.
- `README.md`: user-facing project and module documentation.
- `tsconfig.json`: strict, no-emit TypeScript configuration for WebExtension
  code.

## Development commands

Install dependencies with `npm install`, then use:

- `npm test` — run the Vitest test suite once.
- `npm run tsc` — type-check all files under `src/` without emitting output.
- `npm run registry:validate` — validate registry metadata and referenced files.

Run all three checks before handing off a change. There is currently no build
step and no configured lint or format command.

## Design constraints

- Keep modules self-contained. Do not import from another `w10n` module.
- Prefer a small amount of duplication over creating shared internal
  dependencies.
- Avoid runtime dependencies unless their value clearly outweighs the cost to
  consumers receiving copied source.
- Do not add abstractions, configuration, or tooling without a concrete need.
- Preserve strict TypeScript compatibility and the existing ESM setup.
- Begin every source file with a multiline JSDoc block that states the file's
  purpose, and update it whenever that purpose changes.
- Give every function a multiline JSDoc block that states its purpose. Keep
  these comments purpose-only, without `@param` or `@returns` tags.
- Let TypeScript infer function return types. Add an explicit return type only
  when TypeScript requires one.
- Place exported function declarations before private function declarations.
  Keep imports, types, constants, and module-level variables above the exported
  functions. Within each group, order functions from higher-level operations to
  lower-level details, ending the file with the simplest one-line helpers.
- Use WebExtension APIs through the configured `chrome` types. If behavior
  differs between browsers, document and test the intended compatibility.
- Treat each module's `index.ts` as its public API; keep implementation details
  private unless consumers need to import them directly.

## Making changes

- Add focused Vitest coverage for behavior changes. Put tests next to the
  module they cover and name them `*.test.ts`.
- When adding, moving, or removing any distributable module file, update that
  module's `files` array in `registry.json`. Registry validation cannot detect a
  new source file omitted from this list.
- Give registry files explicit consumer targets under
  `~/src/w10n/<module>/`.
- Update the module description and `README.md` when its public API or usage
  changes.
- Keep unrelated modules and registry entries untouched.

## Adding a module

1. Create `src/<module>/index.ts` with the smallest useful public API.
2. Add colocated tests for observable behavior.
3. Add an item to `registry.json` and enumerate every distributable file.
4. Document installation and usage in `README.md`.
5. Run `npm test`, `npm run tsc`, and `npm run registry:validate`.
