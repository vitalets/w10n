# Context Menu

Create or update context-menu items with stable IDs across extension and
service-worker restarts.

## Register a context-menu item

Use a stable string ID so the same call can update an item left behind by an
earlier service-worker instance:

```ts
import { upsertContextMenu } from './w10n/context-menu';

// ...

const menuId = 'open-dashboard';

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === menuId) {
    // ...
  }
});

await upsertContextMenu(menuId, {
  title: 'Open dashboard',
  contexts: ['action'],
});
```

The properties exclude `id`, which is supplied separately, and `onclick`,
which is unavailable in extension service workers. Register click behavior
through `chrome.contextMenus.onClicked` instead.

An existing item retains any properties omitted from a later call. Calls made
sequentially are idempotent, but the module does not serialize simultaneous
first-time registrations for the same ID.

## Installation

```sh
npx shadcn@latest add vitalets/w10n/context-menu
```

## Updating

Give your coding agent this instruction:

```text
Update local w10n context-menu module from https://github.com/vitalets/w10n/tree/main/src/context-menu,
preserving local customizations. Ask when unsure.
```

## Permissions

Declare the `contextMenus` permission in the extension manifest:

```json
{
  "permissions": ["contextMenus"]
}
```

The module uses the Promise form of `chrome.contextMenus.update()`, which
requires Manifest V3 and Chrome 123 or newer. It uses the callback form of
`chrome.contextMenus.create()` because that method reports some creation
failures only through `chrome.runtime.lastError` in its callback.
