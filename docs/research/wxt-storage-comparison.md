# WXT storage comparison

Research date: 2026-09-03. This comparison covers `@wxt-dev/storage` 1.2.9
and WXT `main` at commit
[`01c2bde`](https://github.com/wxt-dev/wxt/commit/01c2bde0fdfbe851d6a53a2685442d80cb6a8700).
The package changelog identifies 1.2.9 as the current release
([changelog](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/CHANGELOG.md#v129)).

## Conclusion

The race is real, but the proposed module solves only one important subset of
it. It provides actual value when an extension deliberately shares one `Item`
instance among overlapping asynchronous handlers in one JavaScript realm. WXT
is otherwise substantially more capable.

WXT's `setValue` accepts an already-computed value. Its ordinary reads, writes,
and removals call the storage driver independently; only initialize-if-missing
uses a lock
([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L490-L550)).
Consequently, two overlapping `getValue()` -> compute -> `setValue()` sequences
can read the same value and overwrite one another. The proposed
transformation-only `set` can keep that complete sequence inside one FIFO queue.

That guarantee is deliberately narrow: it applies only to calls through one
`Item` instance in one JavaScript realm. It does not coordinate another item
instance, popup, content script, or service worker.

This limitation should be prominent in the API documentation. Calling the
module an extension-storage concurrency solution without that qualifier would
overstate what it provides.

## Is the race a practical extension-storage problem?

Yes, for read-modify-write operations. Chrome storage is asynchronous and is
available from all extension contexts
([Chrome documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)).
Its API exposes independent `get`, `set`, `remove`, and `clear` operations, but
no transaction, compare-and-swap, or atomic-update operation
([Chromium API schema](https://chromium.googlesource.com/chromium/src/+/master/extensions/common/api/storage.json)).
Awaiting each individual call does not make a sequence of calls atomic.

A concrete report in the official Chromium Extensions group describes two
overlapping `webRequest` handlers reading the same token dictionary and then
overwriting one another's additions. Chrome Extensions DevRel confirmed that
the API is not transactional and that simultaneous read-modify-write sequences
can clobber changes
([discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/y5hxPcavRfU)).
A second official-group discussion covers overlapping service-worker events and
recommends preventing simultaneous writes in one realm, centralizing writes,
or using the Web Locks API when multiple pages and workers must coordinate
([discussion](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/QIV4Iv4ZgvE)).

The risk is workload-dependent rather than universal:

- A simple `set` of a complete independent value does not need a
  read-transform-write abstraction. Concurrent direct writes still have
  last-writer/order semantics, but there is no intermediate read to lose.
- Rapid alarms, requests, messages, or tab events can overlap after an `await`
  in the same service-worker realm. A shared per-instance queue addresses this
  case directly.
- Two `Item` instances for the same key have two queues, even in the same realm,
  so they can still lose updates.
- A popup, options page, content script, and service worker are separate realms.
  Their per-instance queues cannot coordinate. Extension-wide consistency
  requires centralizing writes, a cross-context lock, or transactional storage
  such as IndexedDB.

The issue evidence suggests a real edge with potentially high severity for
counters, collections, tokens, or other accumulated state, but not a pervasive
problem for ordinary settings. It can silently lose data when it occurs. The
available first-party evidence does not establish a frequency rate.

### Evidence from WXT's tracker

WXT's maintainer explicitly advises against keeping independently updated
fields under one object key because another function can update a different
field between the read and write. His suggested workaround is to split those
fields into separate keys unless the object is always replaced as one complete
value
([WXT issue #228 comment](https://github.com/wxt-dev/wxt/issues/228#issuecomment-1871420279)).
That is direct first-party confirmation of the same lost-update shape this
module targets.

This is not a recommendation to store only primitives. The maintainer's actual
rule is one top-level key per independently updated and independently watched
unit. A cohesive object such as an auth token pair is appropriate as one key;
five settings changed separately are better as five keys. This module treats a
stored collection as one cohesive array value.

WXT does use a lock for initialized-item creation, after its maintainer
recommended protecting get-or-create behavior with a mutex
([issue #823 comment](https://github.com/wxt-dev/wxt/issues/823#issuecomment-2228636448)).
The implementation and test deliberately limit that protection to one
JavaScript context
([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L490-L506),
[test](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/__tests__/index.test.ts#L1333-L1351)).
That lock is not used for ordinary updates.

No WXT bug specifically demonstrating an ordinary concurrent
read-modify-write lost update was found using searches for `race`,
`concurrent`, `lost update`, `stale`, and `latest value`. That is weak evidence
that users do not report it frequently; it is not evidence that WXT makes the
sequence atomic.

The closest open report, “Get Value does not return the latest value,” mutates
an array returned as the configured fallback and observes that same array on
later reads. It is a shared mutable-fallback case, not a demonstrated
concurrency race
([WXT issue #1766](https://github.com/wxt-dev/wxt/issues/1766)). WXT's source
still exposes separate `getValue`, `setValue`, and `removeValue` operations and
uses its lock for initialize-if-missing, not ordinary updates
([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L490-L575)).

## Storing a collection

Store the collection as an array under one normal key, such as `groups`. The
queued item makes this representation materially safer **inside one shared
instance and realm**: concurrent transformations cannot overwrite one another.
Writers using another item instance or another extension context can still race.

Every edit rewrites the whole array and wakes watchers for the key. In sync
storage, the complete stored array must also fit within Chrome's per-item quota
([Chrome quota documentation](https://developer.chrome.com/docs/extensions/reference/api/storage#property-sync)).

## Cloning mutable defaults

WXT 1.2.9 returns a configured fallback by reference when storage is empty
([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L63-L77),
[item source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L492-L527)).
That caused the array-mutation behavior reported in #1766. The WXT maintainer's
preferred direction was explicitly `structuredClone`, followed by a concern
about future class support
([maintainer comment](https://github.com/wxt-dev/wxt/issues/1766#issuecomment-2993569731),
[class follow-up](https://github.com/wxt-dev/wxt/issues/1766#issuecomment-2993571741)).

Use `structuredClone`, not a JSON stringify/parse round trip, for the proposed
module. Structured cloning creates a deep independent value and supports cycles
and more built-in data types; JSON cloning silently changes or drops some
values and throws for others. The structured-clone algorithm rejects functions
and other uncloneable objects
([HTML Standard](https://html.spec.whatwg.org/multipage/structured-data.html#structured-cloning-api)).
The global API has been broadly available across browsers since March 2022
([MDN compatibility summary](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone)).
Chrome storage is for JSON-serializable values and does not promise to preserve
class identity, so the module should document that defaults must be
storage-compatible data rather than weakening the clone to accommodate classes
([Chrome storage concepts](https://developer.chrome.com/docs/extensions/reference/api/storage#concepts-and-usage)).

The robust lifecycle is to clone once in the constructor to snapshot the
caller's default, then return a fresh clone of that snapshot each time storage
is missing, including when passing it to an updater. Otherwise either mutation
of the caller's original object or mutation of an earlier fallback result can
change future fallback reads without a storage write.

## Direct comparison

| Concern                  | Proposed storage item                                                                                             | WXT Storage 1.2.9                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Construction             | `new storage.local.Item(key, defaultValue)`, with equivalent `sync` and `session` namespaces                      | `storage.defineItem('local:key', { fallback })`; supports `local`, `session`, `sync`, and `managed` key prefixes ([docs](https://wxt.dev/storage#defining-storage-items))                                                                                                                                                                              |
| Default                  | Required, non-persisted fallback snapshotted at construction and freshly cloned whenever storage is missing       | Optional non-persisted `fallback`, or persisted synchronous/asynchronous `init` ([docs](https://wxt.dev/storage#default-values))                                                                                                                                                                                                                       |
| Update API               | `set(transform)` only; the transform receives the latest logical value and `undefined` means no change            | `setValue(value): Promise<void>` only; no updater overload ([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L537-L551))                                                                                                                                                            |
| Ordering                 | One per-instance FIFO queue for `get`, `set`, and `remove`                                                        | No general operation queue; the only item lock protects initialization ([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L490-L575))                                                                                                                                                |
| Missing or removed value | `get()` and the next transform receive the required default                                                       | `getValue()` returns the configured fallback, or `null` without one ([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L492-L528))                                                                                                                                                   |
| Removal                  | Explicit `remove()`; an updater result of `undefined` is a no-op, while `null` can be stored when included in `T` | `removeValue()`; lower-level setting of `null` or `undefined` also removes at runtime ([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L537-L564), [driver](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L619-L625)) |
| Changes                  | Native-like `{ newValue?, oldValue? }`, change-only, with no equality filtering                                   | `watch(newValue, oldValue)`, change-only; suppresses deeply equal values and substitutes the fallback for missing values ([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L659-L678))                                                                                              |
| Broader facilities       | Intentionally none                                                                                                | Metadata, migrations, initialization, bulk operations, snapshots, and restore ([guide](https://wxt.dev/storage))                                                                                                                                                                                                                                       |
| Runtime footprint        | Copied self-contained source with no runtime dependency                                                           | Standalone package using `@wxt-dev/browser`, `superlock`, and bundled `dequal` ([source](https://github.com/wxt-dev/wxt/blob/01c2bde0fdfbe851d6a53a2685442d80cb6a8700/packages/storage/src/index.ts#L9-L11), [without WXT](https://wxt.dev/storage#without-wxt))                                                                                       |

The default, namespaced API, removal, and subscription are mostly alternative
API design, not new capabilities over WXT. The material differentiators are:

- forcing every write through a transformation;
- serializing the read, transformation, and write as one operation;
- ordering `get` and `remove` on the same per-instance queue;
- returning the computed result from `set`, if that remains in the contract;
- shipping inspectable dependency-free source.

## React updater semantics

React is a useful model for the queue, but not for deletion semantics. A
`useState` updater receives pending state and its return value becomes the next
pending state; React processes queued updaters in order
([updater queue](https://react.dev/learn/queueing-a-series-of-state-updates#updating-the-same-state-multiple-times-before-the-next-render)).
React's implementation simply returns `action(state)` when the action is a
function
([source](https://github.com/facebook/react/blob/main/packages/react-reconciler/src/ReactFiberHooks.js#L1190-L1192)).

This gives the proposed storage API two clear rules:

1. If a transform returns the configured default, **store that value**. React
   does not treat equality with the initializer as deletion or absence. Avoiding
   that write would also require an equality policy and would make native change
   behavior less predictable.
2. React gives `undefined` no special meaning: if allowed by the state type, it
   becomes the next state. React's initial state is used only during
   initialization and ignored afterwards
   ([`useState` parameters](https://react.dev/reference/react/useState#parameters)).

### Updater early returns

`undefined` should **not** mean removal. A common early exit such as
`if (condition) return` would then delete persisted data accidentally. Explicit
`remove()` already gives unconditional deletion a clear spelling.

React does not provide a special early-return convention: an updater's return
value becomes the next state. With `useState<T>` where `T` excludes
`undefined`, the updater must return `T`, so the React-style no-op is
`return currentValue`, not a bare `return`.

For this storage API, early-return ergonomics and non-destructive behavior are
more important than matching React exactly. Accept `T | undefined` and define
`undefined` as **no change**:

```ts
set(transform: (currentValue: T) => T | undefined): Promise<T>;
```

This makes an accidental omitted return non-destructive, at the cost of letting
the type checker miss an incomplete updater. Deletion remains explicit through
`remove()`. Returning the configured default stores that value normally; the
default is neither a deletion nor a reset sentinel.

## Recommendation

Keep the module only if forced serialized transformations are its headline
feature and there is an intended single-writer/shared-instance usage pattern.
Describe it as a small same-instance concurrency primitive over native storage,
not as a WXT replacement or an extension-wide atomic store. For users who do
not need that guarantee, WXT already offers the stronger general-purpose
storage abstraction.

With the agreed per-instance queue, documentation and examples should create
one shared `Item` instance per key in each JavaScript context. Two instances for
the same key have independent queues; neither design protects separate
extension contexts.
