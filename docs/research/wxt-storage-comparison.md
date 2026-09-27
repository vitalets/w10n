# WXT storage comparison

Originally researched 2026-09-03; refreshed 2026-09-27 against the implemented
[w10n storage module](../../src/storage/index.ts), its tests, and WXT's official
guide, API reference, and current source. WXT's guide and
[package manifest](https://github.com/wxt-dev/wxt/blob/main/packages/storage/package.json)
identify `@wxt-dev/storage` as 1.2.9. Implementation links below refer to `main`
as inspected on the refresh date; they are not immutable release snapshots.

## Conclusion

w10n offers a small, copied-source API whose main benefit is serialized
read-transform-write operations through one shared item instance. WXT offers
more storage facilities, including initialization, migrations, and metadata.
Both are usable without the WXT framework: WXT explicitly supports installing
`@wxt-dev/storage` on its own
([installation guide](https://wxt.dev/storage.html#without-wxt)).

Choose w10n when overlapping handlers update accumulated state through one
shared instance and the small API is sufficient. Choose WXT when its broader
facilities fit the application. Neither should be described as providing
extension-wide atomic read-modify-write transactions.

## Updates and concurrency

w10n's `set(updater)` runs a storage read, a synchronous updater, and the write
inside one FIFO queue. `get()` and `remove()` share that queue. `set()` resolves
with the resulting value; returning `undefined` skips the write, while `null`
can be stored when included in the value type. A failed operation rejects its
own promise without blocking later operations
([implementation](../../src/storage/index.ts),
[queue tests](../../src/storage/test/queue.test.ts),
[value tests](../../src/storage/test/values.test.ts)).

WXT's item API accepts a complete value in `setValue(value)` and resolves with
`void`; it has no updater overload
([item API](https://wxt.dev/api/reference/wxt/utils/storage/interfaces/wxtstorageitem#setvalue)).
Its source uses a lock for initialize-if-missing, but ordinary writes and
removals do not acquire that lock. There is no general operation queue.
Consequently, overlapping read-compute-write sequences can overwrite each
other: this is an inference from the separate operations, not a measured
frequency claim
([implementation](https://github.com/wxt-dev/wxt/blob/main/packages/storage/src/index.ts#L457-L525)).

w10n's guarantee applies only to operations using the **same item instance**.
Another instance for the same key, direct native writes, and another extension
context remain outside its queue. Even a separate `get()` followed by
`set(() => previouslyComputedValue)` does not receive the protection of
computing inside the updater. Reuse one item per key and place the state-dependent
calculation inside `set`
([implementation](../../src/storage/index.ts)).

## Defaults and initialization

w10n requires a default, snapshots it with `structuredClone` during construction,
and returns a fresh clone whenever the key is absent. Constructing an item does
not access storage; reading a fallback does not persist it. There is no async
initializer or migration phase. Removal restores fallback reads
([implementation](../../src/storage/index.ts),
[value tests](../../src/storage/test/values.test.ts)).

WXT supports an optional non-persisted `fallback`, or a persisted `init` callback
that runs when the value is absent. `init` may return a value or a promise
([options API](https://wxt.dev/api/reference/wxt/utils/storage/interfaces/wxtstorageitemoptions#init)).
Initialization starts when the item is defined; configured migrations start
there too, and item reads and writes await migration processing
([lifecycle guide](https://wxt.dev/storage.html#running-migrations),
[defaults guide](https://wxt.dev/storage.html#default-values)).

WXT returns its fallback by reference rather than cloning it. Reads using
`init` can initialize again after removal. Ordinary `setValue` does not wait
for an in-flight initializer through its lock, so that lock should not be
presented as protection against all initialization/write races
([implementation](https://github.com/wxt-dev/wxt/blob/main/packages/storage/src/index.ts#L457-L514)).

## Subscriptions and storage areas

w10n's `onChange` forwards native `{ newValue?, oldValue? }` for the item's key.
It supplies no initial notification, default substitution, or equality filter.
Both missing fields and stored `null` retain their native meaning
([implementation](../../src/storage/index.ts),
[subscription tests](../../src/storage/test/changes.test.ts)).

WXT's item `watch` supplies `(newValue, oldValue)`, substitutes the fallback
for absent values, and filters deeply equal changes. It does not emit an
initial value. Single-value writes of `null` or `undefined` remove the key
([item implementation](https://github.com/wxt-dev/wxt/blob/main/packages/storage/src/index.ts#L532-L535),
[driver implementation](https://github.com/wxt-dev/wxt/blob/main/packages/storage/src/index.ts#L576-L631)).

w10n exposes writable `local`, `sync`, and `session` namespaces
([implementation](../../src/storage/index.ts)). WXT uses area-prefixed keys and
also supports `managed`
([storage areas](https://wxt.dev/storage.html#basic-usage)). Supporting `sync`
and change listeners should not be confused with serializing concurrent updates.

## Broader facilities and distribution

WXT supports versioned migrations, per-key metadata, and bulk operations
([guide](https://wxt.dev/storage.html)). Its API also provides snapshots and
restore; restore overwrites snapshot keys without removing keys absent from
the snapshot
([snapshot API](https://wxt.dev/api/reference/wxt/utils/storage/interfaces/wxtstorage#restoresnapshot)).
w10n provides none of these facilities
([public API](../../src/storage/index.ts)).

w10n distributes self-contained TypeScript source without runtime imports
([source](../../src/storage/index.ts), [registry](../../registry.json)).
WXT is a package included with WXT or installed separately. Its runtime
dependencies are `@wxt-dev/browser` and `superlock`; its build bundles `dequal`
([package manifest](https://github.com/wxt-dev/wxt/blob/main/packages/storage/package.json)).
No bundle-size claim was measured in this research.
