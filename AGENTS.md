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
- `npm run prettier` — check formatting across the repository.
- `npm run registry:validate` — validate registry metadata and distributable files.

Run `npm test`, `npm run tsc`, and `npm run prettier` before handing off a
change. Run `npm run registry:validate` whenever `registry.json` changes. There
is currently no build step.

## Design constraints

- Keep modules self-contained. Do not import from another `w10n` module.
- Prefer a small amount of duplication over creating shared internal
  dependencies.
- Avoid runtime dependencies unless their value clearly outweighs the cost to
  consumers receiving copied source.
- Do not add abstractions, configuration, or tooling without a concrete need.
- Preserve strict TypeScript compatibility and the existing ESM setup.
- Always use camelCase for storage keys.
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

- Before editing, separate the requested behavior changes from existing
  behavior that must remain.
- Preserve unmentioned public exports, side effects, persistence behavior, and
  failure behavior.
- When a request is ambiguous, implement the narrowest interpretation that
  preserves compatibility.
- For asynchronous initialization, define behavior before loading, after
  success, after failure, and after an explicit update. Ensure older
  asynchronous work cannot overwrite newer explicit state.
- Add Vitest coverage for behavior changes.
- When adding, moving, or removing any distributable module file, update that
  module's `files` array in `registry.json`. Registry validation cannot detect a
  new source file omitted from this list.
- Give registry files explicit consumer targets under
  `~/src/w10n/<module>/`.
- Use canonical terms from `CONTEXT.md` in public APIs, documentation, and tests.
- Update the module description and `README.md` when its public API or usage
  changes.
- Write `Key behavior` as the minimum set of primary consumer benefits—usually
  one. Put requirements, compatibility, implementation details, and edge cases
  in dedicated sections.
- Keep each documentation example focused on one module concept. Use `// ...`
  for app-specific behavior and introduce only APIs required to demonstrate the
  module.
- For asynchronous startup examples, wrap setup in a named `init...()` function
  and invoke it with `void`.
- Keep unrelated modules and registry entries untouched.

## Test conventions

- Always place module tests and module-specific test helpers in
  `src/<module>/test/`. Name test files `*.test.ts`.
- Prefer top-level tests. Use `describe` only when shared scope or setup
  materially improves readability.
- Give tests short, behavior-first names using product language rather than
  implementation terminology.
- Keep each test focused on one observable behavior and exercise the smallest
  representative public surface.
- Use neutral payloads. When order matters, use distinct neutral values.
- Make test setup mirror real external state with explicit objects and field
  names. Avoid convenience aliases that hide what is configured.
- Assert observable state and output instead of mock call details, unless the
  interaction itself is the contract.
- Name test-harness results after the observable outcome they contain.
- Add coverage to an existing behavior-oriented test file when it fits; create
  another file only for a distinct concern.

## Adding a module

1. Create `src/<module>/index.ts` with the smallest useful public API.
2. Add tests for observable behavior following the test conventions above.
3. Add an item to `registry.json` and enumerate every distributable file.
4. Document installation and usage in `README.md`.
5. Run `npm test` and `npm run tsc`.
