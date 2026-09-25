# Context Menu

Stable-ID registration for WebExtension context-menu items across extension and
service-worker restarts.

## Key behavior

- Provides a universal helper for creating or updating a context-menu item.

## Requirements

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

## Installation

```sh
npx shadcn@latest add vitalets/w10n/context-menu
```

## Register a context-menu item

Use a stable string ID so the same call can update an item left behind by an
earlier service-worker instance:

```ts
import { upsertContextMenu } from './w10n/context-menu';

async function initContextMenu() {
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
}

void initContextMenu();
```

The properties exclude `id`, which is supplied separately, and `onclick`,
which is unavailable in extension service workers. Register click behavior
through `chrome.contextMenus.onClicked` instead.

An existing item retains any properties omitted from a later call. Calls made
sequentially are idempotent, but the module does not serialize simultaneous
first-time registrations for the same ID.
