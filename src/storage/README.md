# Storage

A key-bound WebExtension storage interface with serialized read-transform-write
operations.

## Key behavior

- Per-instance FIFO queue for `get()`, `set()`, and `remove()`.
- Structured-cloned defaults.
- An `undefined` updater result is a no-op; `remove()` deletes explicitly.
- `local`, `session`, and `sync` namespaces.
- Native-like change subscriptions.
- Errors do not poison later queued operations.
- Collection guidance for array storage.

## Installation

```sh
npx shadcn@latest add vitalets/w10n/storage
```

Add the `storage` permission to the extension manifest:

```json
{
  "permissions": ["storage"]
}
```

## Usage

Create and export one shared item instance per key in each extension context:

```ts
import { storage } from './w10n/storage';

interface Group {
  id: string;
  title: string;
}

export const groups = new storage.sync.Item<Group[]>('groups', []);
```

The default is a non-persisted fallback. It is snapshotted when the item is
constructed and freshly cloned whenever the key is absent:

```ts
await groups.get(); // [] when the key is absent
```

`set()` accepts only a synchronous transformation. The whole read-transform-write
operation runs in the item's queue, and the promise resolves with the resulting
value:

```ts
const updatedGroups = await groups.set((currentGroups) => [
  ...currentGroups,
  { id: crypto.randomUUID(), title: 'Inbox' },
]);
```

Returning `undefined` skips the write and resolves with the current value. Returning
the configured default stores that value normally. Removal is always explicit:

```ts
await groups.set((currentGroups) => {
  if (currentGroups.every((group) => group.title !== 'Inbox')) return;
  return currentGroups.filter((group) => group.title !== 'Inbox');
});

await groups.remove();
await groups.get(); // []
```

`null` is an ordinary stored value when included in the item type.

## Changes

`onChange()` forwards the selected area's native change object for the item's key.
It does not emit the current value when subscribed, substitute the fallback, or
filter equal values:

```ts
const unsubscribe = groups.onChange(({ newValue, oldValue }) => {
  console.log({ newValue, oldValue });
});

unsubscribe();
```

## Collections

Store a collection as an array in one item. Queued transformations serialize
read-modify-write operations performed through the shared item instance:

```ts
const groups = new storage.local.Item<Group[]>('groups', []);
```

## Concurrency boundary

The queue belongs to one item instance in one JavaScript realm. It protects
overlapping handlers only when they share that instance. Separate item instances,
popups, content scripts, options pages, and service workers do not share queues.
Coordinate cross-context writes separately when they can target the same key.

Failed reads, transformations, writes, and removals reject their individual calls;
later queued operations continue. Change callbacks follow the browser's native event
timing and do not run through the item queue.

Defaults must be valid structured-cloneable WebExtension storage values. The module
supports writable areas only; managed storage remains available through the native
read-only API.
