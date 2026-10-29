# Migration

Sequential extension upgrade migrations ordered by target release.

## Install

```sh
npx shadcn@latest add vitalets/w10n/migration
```

## Key behavior

Runs applicable upgrade steps in release order, including releases skipped during an upgrade.

## API

- `Migration`: an object with `version: string` and `run: () => Promise<void>`.
- `MigrationVersions`: `{ previousVersion: string; currentVersion: string }`.
- `runMigrations(migrations: readonly Migration[], versions: MigrationVersions)`:
  resolves with no value after all selected steps finish, or rejects on invalid
  versions or a failed step.

The target version is the release introducing the migration. Selection uses
`previousVersion < migration.version <= currentVersion`. For example, upgrading
from 1.7 to 2.1 runs targets 2.0 and 2.1; upgrading from 2.0 to 2.1 runs only 2.1.

## Define a migration

Export each migration from a consumer-owned module, such as `migrations/release-2-1.ts`:

```ts
import type { Migration } from '../w10n/migration';

export const migration: Migration = {
  version: '2.1',
  async run() {
    // ...
  },
};
```

## Register upgrade handling

Register the listener synchronously when the background worker starts:

```ts
import { runMigrations } from './w10n/migration';
import { migration as release20 } from './migrations/release-2-0';
import { migration as release21 } from './migrations/release-2-1';

function initMigrations() {
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== 'update' || details.previousVersion === undefined) return;
    try {
      await runMigrations([release21, release20], {
        previousVersion: details.previousVersion,
        currentVersion: chrome.runtime.getManifest().version,
      });
      // ...
    } catch (error) {
      console.error('Could not run upgrade migrations', error);
    }
  });
}

void initMigrations();
```

Listing order does not determine order across different targets. If your app
already has an installation handler, call and await `runMigrations` there before
rebuilding dependent state. Use one lifecycle owner. Awaiting the runner in one
handler does not block other listeners, extension contexts, or independent startup work.

The module registers no listeners and reads no manifest or storage itself. It
requires no storage permission; individual callbacks may require permissions.

## Version rules and ordering

Versions follow [Chrome manifest version rules](https://developer.chrome.com/docs/extensions/reference/manifest/version):
one to four integer components from 0 through 65535, no leading zeros except `0`,
and at least one nonzero component. Prerelease/build syntax and `version_name`
are unsupported. Ordering is numeric: 2.10 follows 2.9. Omitted components count
as zero, so 2, 2.0, and 2.0.0.0 are equivalent.

All bounds and registered targets are validated before any callback, even for
an equal-version call or downgrade. Invalid versions reject with the invalid
value in the error. An empty registry still validates both bounds.

Equal bounds and downgrades execute nothing. Equal targets retain registration
order. The caller's array is never mutated, and frozen arrays are supported.
Each callback finishes before the next begins.

## Failure and repetition

A rejected callback stops execution and its error propagates unchanged. Earlier
writes survive; there is no rollback or automatic logging. Repeating a call
repeats its selected callbacks, even after a prior failure. Make steps safe to
repeat where appropriate.

Each invocation is independent: there is no lock, queue, cross-context
coordination, retry, checkpoint, or exactly-once guarantee. The runner stores no
progress. A worker interruption or failed migration is not automatically resumed
on startup. Release versions indicate eligibility, not successful completion.
For example, if a step targeting 2.0 fails during an upgrade to 2.1, a later
upgrade from 2.1 to 2.2 will not select that step again. Awaiting the runner does
not guarantee that the browser keeps a worker alive until completion.
